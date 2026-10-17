'use server'
import { db } from '@/lib/db'
import { notasFiscaisSaida, notasFiscaisSaidaCartas, usuarios } from '@/lib/db/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { podeUsuarioVerGrupo } from '@/lib/grupo'
import { configNotaGateway, consultarCartaCorrecao, enviarCartaCorrecao, CartaRecusada, type ConfigNotaGateway } from '@/lib/notagateway/client'
import { proximoNumeroCarta, situacaoCarta, validarTextoCarta, type SituacaoCarta } from '@/lib/notagateway/carta-correcao'
import { podeOperarNfSaida } from './papeis-nf-saida'

/**
 * Carta de correção da NF de saída (#187). Mesma permissão do cancelamento, no
 * grupo da nota. Como a emissão, o envio é assíncrono: a action acompanha a
 * consulta por alguns segundos e o que sobrar a tela reconsulta.
 */

export type CartaResumo = {
  id: string
  numero: number
  correcao: string
  situacao: SituacaoCarta
  motivoStatus: string | null
  protocolo: string | null
  ambiente: string
  por: string | null
  criadoEm: string
}

export type ResultadoCartas = { ok: true; cartas: CartaResumo[] } | { ok: false; error: string; cartas?: CartaResumo[] }

const NOME_AMBIENTE: Record<string, string> = { Producao: 'produção', Homologacao: 'homologação' }

async function carregar(notaId: string, acao: string) {
  const u = await getUsuarioLogado()
  if (!podeOperarNfSaida(u.papel)) throw new Error(`Sem permissão para ${acao} carta de correção`)
  const [nota] = await db.select().from(notasFiscaisSaida).where(eq(notasFiscaisSaida.id, notaId)).limit(1)
  if (!nota) throw new Error('Nota não encontrada')
  if (!(await podeUsuarioVerGrupo(u, nota.grupoId))) throw new Error('Sem permissão para NF de saída deste grupo')
  const cfg = await configNotaGateway(nota.grupoId)
  if (!cfg) throw new Error('Emissão pelo MOVA não configurada para este grupo')
  return { u, nota, cfg }
}

async function cartasDaNota(notaId: string): Promise<CartaResumo[]> {
  const linhas = await db.select({ c: notasFiscaisSaidaCartas, por: usuarios.nome })
    .from(notasFiscaisSaidaCartas)
    .leftJoin(usuarios, eq(usuarios.id, notasFiscaisSaidaCartas.emitidaPor))
    .where(eq(notasFiscaisSaidaCartas.notaId, notaId))
    .orderBy(asc(notasFiscaisSaidaCartas.criadoEm))
  return linhas.map(({ c, por }) => ({
    id: c.id, numero: c.numero, correcao: c.correcao, situacao: c.situacao as SituacaoCarta,
    motivoStatus: c.motivoStatus, protocolo: c.protocolo, ambiente: c.ambiente, por,
    criadoEm: c.criadoEm.toISOString(),
  }))
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Consulta a API e grava; devolve a situação gravada. */
async function reconsultarCarta(cfg: ConfigNotaGateway, carta: { id: string; idExterno: string }) {
  const c = await consultarCartaCorrecao(cfg, carta.idExterno)
  if (!c) return 'pendente' as const
  const situacao = situacaoCarta(c.status)
  await db.update(notasFiscaisSaidaCartas).set({
    status: c.status, situacao, motivoStatus: c.motivoStatus, protocolo: c.protocolo,
    atualizadoEm: sql`now()` as unknown as Date,
  }).where(eq(notasFiscaisSaidaCartas.id, carta.id))
  return situacao
}

export async function cartasDaNotaAction(notaId: string): Promise<ResultadoCartas> {
  try {
    await carregar(notaId, 'consultar')
    return { ok: true, cartas: await cartasDaNota(notaId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function emitirCartaCorrecaoAction(notaId: string, textoBruto: string): Promise<ResultadoCartas> {
  try {
    const { u, nota, cfg } = await carregar(notaId, 'emitir')
    const texto = validarTextoCarta(textoBruto)
    if (!texto.ok) return { ok: false, error: texto.erro }
    if (nota.status !== 'Autorizada' || !nota.chave) return { ok: false, error: 'Só nota autorizada recebe carta de correção' }
    if (cfg.ambiente !== nota.ambiente) {
      return { ok: false, error: `Esta nota é de ${NOME_AMBIENTE[nota.ambiente]} e o grupo está em ${NOME_AMBIENTE[cfg.ambiente]} — volte o ambiente em Admin → Notas fiscais para corrigi-la` }
    }

    const existentes = await cartasDaNota(notaId)
    const proximo = proximoNumeroCarta(existentes)
    if (!proximo.ok) return { ok: false, error: proximo.erro, cartas: existentes }

    // Id novo a cada tentativa: a recusada guarda o dela como histórico.
    const idExterno = `cce-${nota.idExterno}-${proximo.numero}-${existentes.length + 1}`
    let cartaId: string
    try {
      const [nova] = await db.insert(notasFiscaisSaidaCartas).values({
        notaId, grupoId: nota.grupoId, idExterno, ambiente: nota.ambiente, numero: proximo.numero,
        correcao: texto.texto, emitidaPor: u.id,
      }).returning({ id: notasFiscaisSaidaCartas.id })
      cartaId = nova.id
    } catch {
      // Outra aba enviou a mesma carta ao mesmo tempo: o índice único barrou esta.
      return { ok: false, error: 'Outra carta de correção acabou de ser enviada para esta nota — confira e tente de novo', cartas: await cartasDaNota(notaId) }
    }

    try {
      await enviarCartaCorrecao(cfg, { idExterno, numero: proximo.numero, correcao: texto.texto, chaveNfe: nota.chave })
    } catch (err) {
      if (err instanceof CartaRecusada) {
        await db.update(notasFiscaisSaidaCartas).set({
          situacao: 'recusada', status: 'Recusada', motivoStatus: err.message, atualizadoEm: sql`now()` as unknown as Date,
        }).where(eq(notasFiscaisSaidaCartas.id, cartaId))
        return { ok: true, cartas: await cartasDaNota(notaId) }
      }
      // Sem resposta clara: a carta fica pendente e a tela reconsulta.
      return { ok: false, error: `Não deu para confirmar o envio (${(err as Error).message}) — reconsulte a carta em instantes`, cartas: await cartasDaNota(notaId) }
    }

    for (let i = 0; i < 8; i++) {
      await espera(i === 0 ? 2500 : 2000)
      if ((await reconsultarCarta(cfg, { id: cartaId, idExterno })) !== 'pendente') break
    }
    return { ok: true, cartas: await cartasDaNota(notaId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Reconsulta as cartas pendentes da nota. */
export async function reconsultarCartasAction(notaId: string): Promise<ResultadoCartas> {
  try {
    const { cfg } = await carregar(notaId, 'consultar')
    const pendentes = await db.select({ id: notasFiscaisSaidaCartas.id, idExterno: notasFiscaisSaidaCartas.idExterno })
      .from(notasFiscaisSaidaCartas)
      .where(and(eq(notasFiscaisSaidaCartas.notaId, notaId), eq(notasFiscaisSaidaCartas.situacao, 'pendente')))
    for (const p of pendentes) await reconsultarCarta(cfg, p)
    return { ok: true, cartas: await cartasDaNota(notaId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

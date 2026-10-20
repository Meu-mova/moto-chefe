'use server'
import { db } from '@/lib/db'
import { notasFiscaisSaida, notasFiscaisSaidaCartas, usuarios } from '@/lib/db/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { podeUsuarioVerGrupo } from '@/lib/grupo'
import { configNotaGateway, consultarCartaCorrecao, enviarCartaCorrecao, CartaRecusada, type ConfigNotaGateway } from '@/lib/notagateway/client'
import { podeDescartarCarta, proximoNumeroCarta, recusaNaGateway, situacaoCarta, validarTextoCarta, type SituacaoCarta } from '@/lib/notagateway/carta-correcao'
import { podeOperarNfSaida } from './papeis-nf-saida'
import { espera } from '@/lib/espera'
import { divergenciaDeAmbiente } from '@/lib/notagateway/ambiente'

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

// Só sai de pendente uma vez: sem isso, descarte e reconsulta simultâneos se
// sobrescrevem, e uma autorizada virar recusada libera um número já registrado na SEFAZ.
function aindaPendente(cartaId: string) {
  return and(eq(notasFiscaisSaidaCartas.id, cartaId), eq(notasFiscaisSaidaCartas.situacao, 'pendente'))
}

export type ResultadoCartas = { ok: true; cartas: CartaResumo[] } | { ok: false; error: string; cartas?: CartaResumo[] }

/** A nota e a configuração do grupo dela, com a permissão no grupo da nota. */
async function carregarNotaDaCarta(notaId: string, acao: string) {
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
    id: c.id, numero: c.numero, correcao: c.correcao, situacao: c.situacao,
    motivoStatus: c.motivoStatus, protocolo: c.protocolo, ambiente: c.ambiente, por,
    criadoEm: c.criadoEm.toISOString(),
  }))
}

/** Consulta a API e grava; devolve a situação gravada. */
async function reconsultarCarta(cfg: ConfigNotaGateway, carta: { id: string; idExterno: string }) {
  const c = await consultarCartaCorrecao(cfg, carta.idExterno)
  if (!c) return 'pendente' as const
  const situacao = situacaoCarta(c.status)
  await db.update(notasFiscaisSaidaCartas).set({
    status: c.status, situacao, motivoStatus: c.motivoStatus, protocolo: c.protocolo,
    atualizadoEm: sql`now()` as unknown as Date,
  }).where(aindaPendente(carta.id))
  return situacao
}

export async function cartasDaNotaAction(notaId: string): Promise<ResultadoCartas> {
  try {
    await carregarNotaDaCarta(notaId, 'consultar')
    return { ok: true, cartas: await cartasDaNota(notaId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function emitirCartaCorrecaoAction(notaId: string, textoBruto: string): Promise<ResultadoCartas> {
  try {
    const { u, nota, cfg } = await carregarNotaDaCarta(notaId, 'emitir')
    const texto = validarTextoCarta(textoBruto)
    if (!texto.ok) return { ok: false, error: texto.erro }
    if (nota.status !== 'Autorizada' || !nota.chave) return { ok: false, error: 'Só nota autorizada recebe carta de correção' }
    const divergencia = divergenciaDeAmbiente(nota.ambiente, cfg.ambiente, 'corrigi-la')
    if (divergencia) return { ok: false, error: divergencia }

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
    } catch (err) {
      // 23505: outra aba enviou a mesma carta ao mesmo tempo e o índice único barrou esta.
      if ((err as { code?: string }).code !== '23505') throw err
      return { ok: false, error: 'Outra carta de correção acabou de ser enviada para esta nota — confira e tente de novo', cartas: await cartasDaNota(notaId) }
    }

    try {
      await enviarCartaCorrecao(cfg, { idExterno, numero: proximo.numero, correcao: texto.texto, chaveNfe: nota.chave })
    } catch (err) {
      if (err instanceof CartaRecusada) {
        await db.update(notasFiscaisSaidaCartas).set({
          situacao: 'recusada', status: 'Recusada', motivoStatus: err.message, atualizadoEm: sql`now()` as unknown as Date,
        }).where(aindaPendente(cartaId))
        return { ok: true, cartas: await cartasDaNota(notaId) }
      }
      // Sem resposta clara: a carta fica pendente e a tela reconsulta.
      return { ok: false, error: `Não deu para confirmar o envio (${(err as Error).message}) — reconsulte a carta em instantes`, cartas: await cartasDaNota(notaId) }
    }

    try {
      for (let i = 0; i < 8; i++) {
        await espera(i === 0 ? 2500 : 2000)
        if ((await reconsultarCarta(cfg, { id: cartaId, idExterno })) !== 'pendente') break
      }
    } catch (err) {
      // A carta foi enviada: a falha é só da consulta, e a tela reconsulta.
      return { ok: false, error: `Carta enviada, mas a consulta falhou (${(err as Error).message}) — reconsulte em instantes`, cartas: await cartasDaNota(notaId) }
    }
    return { ok: true, cartas: await cartasDaNota(notaId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Reconsulta as cartas pendentes da nota. */
export async function reconsultarCartasAction(notaId: string): Promise<ResultadoCartas> {
  try {
    const { nota, cfg } = await carregarNotaDaCarta(notaId, 'consultar')
    const divergencia = divergenciaDeAmbiente(nota.ambiente, cfg.ambiente, 'consultar as cartas')
    if (divergencia) return { ok: false, error: divergencia }
    const pendentes = await db.select({ id: notasFiscaisSaidaCartas.id, idExterno: notasFiscaisSaidaCartas.idExterno })
      .from(notasFiscaisSaidaCartas)
      .where(and(eq(notasFiscaisSaidaCartas.notaId, notaId), eq(notasFiscaisSaidaCartas.situacao, 'pendente')))
    for (const p of pendentes) await reconsultarCarta(cfg, p)
    return { ok: true, cartas: await cartasDaNota(notaId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Descarta a carta pendente que não chegou à Nota Gateway, ou que chegou e a
 * SEFAZ negou: só depois do prazo e se a consulta confirmar um dos dois. Fica
 * como recusada, e o número volta para a próxima tentativa.
 */
export async function descartarCartaAction(notaId: string, cartaId: string): Promise<ResultadoCartas> {
  try {
    const { nota, cfg } = await carregarNotaDaCarta(notaId, 'descartar')
    const divergencia = divergenciaDeAmbiente(nota.ambiente, cfg.ambiente, 'descartar a carta')
    if (divergencia) return { ok: false, error: divergencia }
    const [carta] = await db.select().from(notasFiscaisSaidaCartas)
      .where(and(eq(notasFiscaisSaidaCartas.id, cartaId), eq(notasFiscaisSaidaCartas.notaId, notaId))).limit(1)
    if (!carta) return { ok: false, error: 'Carta não encontrada' }
    if (!podeDescartarCarta({ situacao: carta.situacao, criadoEm: carta.criadoEm.toISOString() }, new Date())) {
      return { ok: false, error: 'Só carta pendente há algum tempo pode ser descartada', cartas: await cartasDaNota(notaId) }
    }
    const naGateway = await consultarCartaCorrecao(cfg, carta.idExterno)
    const recusa = naGateway && recusaNaGateway(naGateway)
    if (naGateway && !recusa) {
      await reconsultarCarta(cfg, carta)
      return { ok: false, error: 'A carta existe na Nota Gateway: não dá para descartar. Reconsulte para ver o status', cartas: await cartasDaNota(notaId) }
    }
    await db.update(notasFiscaisSaidaCartas).set({
      situacao: 'recusada', status: naGateway ? naGateway.status : 'Descartada',
      motivoStatus: recusa || 'Descartada: o envio não chegou à Nota Gateway',
      atualizadoEm: sql`now()` as unknown as Date,
    }).where(aindaPendente(cartaId))
    return { ok: true, cartas: await cartasDaNota(notaId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

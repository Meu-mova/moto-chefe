import { and, asc, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  avaliacoesGoogle, avaliacoesGoogleConfig, avaliacoesGoogleHistorico, avaliacoesGoogleLojas,
  avaliacoesGoogleToques, grupos, lojas,
} from '@/lib/db/schema'
import { cifrar, decifrar } from '@/lib/cripto'
import { grupoEstaNaConta } from '@/lib/conta'
import { hojeBrt, inicioDoDiaBrt, mesBrt } from '@/lib/data-venda'
import {
  codigoPlacaValido, gerarCodigoPlaca, linkEscreverAvaliacao, placeIdValido, type LugarPlaces,
} from './places'

/**
 * Avaliações do Google por loja e os toques da plaquinha NFC/QR.
 * Tudo por grupo: só os sócios do próprio grupo leem e configuram, e nada cruza Conta.
 * Sem next/headers, para ser testado contra o banco; a action resolve o grupo ativo.
 */

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>
type Usuario = { id?: string; papel: string; contaId: string | null }
type Resultado = { ok: true } | { ok: false; erro: string }

/** Conteúdo do Google não fica mais que isso (termos da Google Maps Platform). */
export const DIAS_RETENCAO = 30

export const podeGerirAvaliacoes = (papel: string) => papel === 'admin_geral' || papel === 'admin_socio'

async function grupoDoUsuario(usuario: Usuario, grupoId: string, exec: Executor): Promise<boolean> {
  if (!podeGerirAvaliacoes(usuario.papel)) return false
  if (usuario.papel === 'admin_geral') {
    const [g] = await exec.select({ id: grupos.id }).from(grupos).where(eq(grupos.id, grupoId)).limit(1)
    return !!g
  }
  return grupoEstaNaConta(grupoId, usuario.contaId, exec)
}

export async function salvarChaveGoogle(
  usuario: Usuario,
  data: { grupoId: string; chave: string },
  exec: Executor = db,
): Promise<Resultado> {
  if (!(await grupoDoUsuario(usuario, data.grupoId, exec))) return { ok: false, erro: 'Grupo não encontrado' }
  const chave = data.chave.trim()
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(chave)) return { ok: false, erro: 'Chave da API em formato inválido' }
  const cifrada = cifrar(chave)
  await exec.insert(avaliacoesGoogleConfig)
    .values({ grupoId: data.grupoId, apiKey: cifrada, atualizadoPor: usuario.id ?? null })
    .onConflictDoUpdate({
      target: avaliacoesGoogleConfig.grupoId,
      set: { apiKey: cifrada, atualizadoEm: new Date(), atualizadoPor: usuario.id ?? null },
      setWhere: eq(avaliacoesGoogleConfig.grupoId, data.grupoId),
    })
  return { ok: true }
}

/**
 * Liga a loja à ficha dela no Google. Na primeira vez gera o código da placa, que não muda
 * depois (a tag já gravada continua valendo se o Place ID for trocado). Place ID vazio
 * desliga a leitura, mas mantém o código.
 */
export async function salvarPlaceIdLoja(
  usuario: Usuario,
  data: { grupoId: string; lojaId: string; placeId: string },
  exec: Executor = db,
): Promise<Resultado> {
  const naoEncontrada = { ok: false as const, erro: 'Loja não encontrada' }
  if (!(await grupoDoUsuario(usuario, data.grupoId, exec))) return naoEncontrada
  const [loja] = await exec.select({ id: lojas.id }).from(lojas)
    .where(and(eq(lojas.id, data.lojaId), eq(lojas.grupoId, data.grupoId))).limit(1)
  if (!loja) return naoEncontrada

  const placeId = data.placeId.trim() || null
  if (placeId && !placeIdValido(placeId)) return { ok: false, erro: 'Place ID em formato inválido' }

  const [atual] = await exec.select({ grupoId: avaliacoesGoogleLojas.grupoId, placeId: avaliacoesGoogleLojas.placeId })
    .from(avaliacoesGoogleLojas).where(eq(avaliacoesGoogleLojas.lojaId, loja.id)).limit(1)
  // Linha de outro grupo (loja que mudou de grupo): não reaproveita, para não levar histórico junto.
  if (atual && atual.grupoId !== data.grupoId) return naoEncontrada

  const trocouFicha = atual?.placeId !== placeId
  const limpaLeitura = trocouFicha
    ? { nota: null, totalAvaliacoes: null, mapsUri: null, sincronizadoEm: null, erroSincronizacao: null }
    : {}
  await exec.insert(avaliacoesGoogleLojas)
    .values({ lojaId: loja.id, grupoId: data.grupoId, placeId, codigoPlaca: gerarCodigoPlaca() })
    .onConflictDoUpdate({
      target: avaliacoesGoogleLojas.lojaId,
      set: { placeId, ...limpaLeitura },
      setWhere: eq(avaliacoesGoogleLojas.grupoId, data.grupoId),
    })
  if (atual && trocouFicha) {
    // Avaliações e histórico eram da ficha antiga.
    await exec.delete(avaliacoesGoogle).where(and(eq(avaliacoesGoogle.lojaId, loja.id), eq(avaliacoesGoogle.grupoId, data.grupoId)))
    await exec.delete(avaliacoesGoogleHistorico).where(and(eq(avaliacoesGoogleHistorico.lojaId, loja.id), eq(avaliacoesGoogleHistorico.grupoId, data.grupoId)))
  }
  return { ok: true }
}

export type AvaliacaoTela = {
  googleId: string
  autor: string | null
  autorUri: string | null
  nota: number
  texto: string | null
  publicadaEm: string | null
}

export type LojaPainel = {
  lojaId: string
  nome: string
  placeId: string | null
  codigoPlaca: string | null
  nota: number | null
  total: number | null
  mapsUri: string | null
  sincronizadoEm: string | null
  erro: string | null
  /** Diferença para a foto mais antiga dos últimos 30 dias; null sem histórico. */
  variacao: { nota: number | null; total: number | null; desde: string } | null
  toquesMes: { nfc: number; qr: number }
  avaliacoes: AvaliacaoTela[]
}

export type PainelAvaliacoes = { temChave: boolean; lojas: LojaPainel[] }

const num = (v: string | null) => (v === null ? null : Number(v))

export async function painelAvaliacoes(
  usuario: Usuario,
  grupoId: string,
  exec: Executor = db,
  agora: Date = new Date(),
): Promise<PainelAvaliacoes | null> {
  if (!(await grupoDoUsuario(usuario, grupoId, exec))) return null

  const inicioMes = inicioDoDiaBrt(`${mesBrt(agora)}-01`).toISOString()
  const [config, linhas, historico, toques, avaliacoes] = await Promise.all([
    exec.select({ grupoId: avaliacoesGoogleConfig.grupoId }).from(avaliacoesGoogleConfig)
      .where(eq(avaliacoesGoogleConfig.grupoId, grupoId)).limit(1),
    exec.select({
      lojaId: lojas.id, nome: lojas.nome,
      placeId: avaliacoesGoogleLojas.placeId, codigoPlaca: avaliacoesGoogleLojas.codigoPlaca,
      nota: avaliacoesGoogleLojas.nota, total: avaliacoesGoogleLojas.totalAvaliacoes,
      mapsUri: avaliacoesGoogleLojas.mapsUri, sincronizadoEm: avaliacoesGoogleLojas.sincronizadoEm,
      erro: avaliacoesGoogleLojas.erroSincronizacao,
    })
      .from(lojas)
      .leftJoin(avaliacoesGoogleLojas, and(eq(avaliacoesGoogleLojas.lojaId, lojas.id), eq(avaliacoesGoogleLojas.grupoId, grupoId)))
      .where(and(eq(lojas.grupoId, grupoId), eq(lojas.ativa, true)))
      .orderBy(asc(lojas.nome)),
    exec.select({
      lojaId: avaliacoesGoogleHistorico.lojaId, dia: avaliacoesGoogleHistorico.dia,
      nota: avaliacoesGoogleHistorico.nota, total: avaliacoesGoogleHistorico.totalAvaliacoes,
    })
      .from(avaliacoesGoogleHistorico)
      .where(eq(avaliacoesGoogleHistorico.grupoId, grupoId))
      .orderBy(asc(avaliacoesGoogleHistorico.dia)),
    exec.select({
      lojaId: avaliacoesGoogleToques.lojaId, origem: avaliacoesGoogleToques.origem,
      n: sql<number>`count(*)::int`,
    })
      .from(avaliacoesGoogleToques)
      .where(and(eq(avaliacoesGoogleToques.grupoId, grupoId), gte(avaliacoesGoogleToques.criadoEm, sql`${inicioMes}::timestamptz`)))
      .groupBy(avaliacoesGoogleToques.lojaId, avaliacoesGoogleToques.origem),
    exec.select({
      lojaId: avaliacoesGoogle.lojaId, googleId: avaliacoesGoogle.googleId, autor: avaliacoesGoogle.autor,
      autorUri: avaliacoesGoogle.autorUri, nota: avaliacoesGoogle.nota, texto: avaliacoesGoogle.texto,
      publicadaEm: avaliacoesGoogle.publicadaEm,
    })
      .from(avaliacoesGoogle)
      .where(eq(avaliacoesGoogle.grupoId, grupoId))
      .orderBy(desc(avaliacoesGoogle.publicadaEm)),
  ])

  return {
    temChave: config.length > 0,
    lojas: linhas.map(l => {
      const fotos = historico.filter(h => h.lojaId === l.lojaId)
      const primeira = fotos[0]
      const nota = num(l.nota)
      const variacao = primeira && fotos.length > 1
        ? {
            nota: nota !== null && primeira.nota !== null ? Math.round((nota - Number(primeira.nota)) * 10) / 10 : null,
            total: l.total !== null && primeira.total !== null ? l.total - primeira.total : null,
            desde: primeira.dia,
          }
        : null
      const toquesDaLoja = toques.filter(t => t.lojaId === l.lojaId)
      return {
        lojaId: l.lojaId,
        nome: l.nome,
        placeId: l.placeId ?? null,
        codigoPlaca: l.codigoPlaca ?? null,
        nota,
        total: l.total ?? null,
        mapsUri: l.mapsUri ?? null,
        sincronizadoEm: l.sincronizadoEm?.toISOString() ?? null,
        erro: l.erro ?? null,
        variacao,
        toquesMes: {
          nfc: toquesDaLoja.find(t => t.origem === 'nfc')?.n ?? 0,
          qr: toquesDaLoja.find(t => t.origem === 'qr')?.n ?? 0,
        },
        avaliacoes: avaliacoes.filter(a => a.lojaId === l.lojaId).slice(0, 10).map(a => ({
          googleId: a.googleId, autor: a.autor, autorUri: a.autorUri, nota: a.nota, texto: a.texto,
          publicadaEm: a.publicadaEm?.toISOString() ?? null,
        })),
      }
    }),
  }
}

/**
 * Toque na placa ou leitura do QR (rota pública /avaliar/<codigo>). O código é a credencial:
 * devolve o link do Google para redirecionar, ou null se a placa não existe ou ainda não
 * tem ficha do Google.
 */
export async function registrarToque(
  codigo: string,
  origem: 'nfc' | 'qr',
  exec: Executor = db,
): Promise<string | null> {
  if (!codigoPlacaValido(codigo)) return null
  const [placa] = await exec.select({
    lojaId: avaliacoesGoogleLojas.lojaId, grupoId: avaliacoesGoogleLojas.grupoId, placeId: avaliacoesGoogleLojas.placeId,
  })
    .from(avaliacoesGoogleLojas)
    .where(eq(avaliacoesGoogleLojas.codigoPlaca, codigo)).limit(1)
  if (!placa?.placeId) return null
  await exec.insert(avaliacoesGoogleToques).values({ lojaId: placa.lojaId, grupoId: placa.grupoId, origem })
  return linkEscreverAvaliacao(placa.placeId)
}

export type DependenciasSync = {
  buscarLugar: (apiKey: string, placeId: string) => Promise<LugarPlaces>
}

export type ResultadoSync = { lojas: number; erros: number }

/** Lê no Google cada loja do grupo que tem Place ID e grava nota, total, avaliações e a foto do dia. */
export async function sincronizarGrupo(
  grupoId: string,
  deps: DependenciasSync,
  exec: Executor = db,
  agora: Date = new Date(),
): Promise<ResultadoSync> {
  const [config] = await exec.select({ apiKey: avaliacoesGoogleConfig.apiKey }).from(avaliacoesGoogleConfig)
    .where(eq(avaliacoesGoogleConfig.grupoId, grupoId)).limit(1)
  if (!config) return { lojas: 0, erros: 0 }
  const apiKey = decifrar(config.apiKey).toString('utf8')

  const placas = await exec.select({ lojaId: avaliacoesGoogleLojas.lojaId, placeId: avaliacoesGoogleLojas.placeId })
    .from(avaliacoesGoogleLojas)
    .innerJoin(lojas, eq(lojas.id, avaliacoesGoogleLojas.lojaId))
    .where(and(
      eq(avaliacoesGoogleLojas.grupoId, grupoId), eq(lojas.grupoId, grupoId),
      eq(lojas.ativa, true), isNotNull(avaliacoesGoogleLojas.placeId),
    ))

  const doGrupo = (lojaId: string) => and(eq(avaliacoesGoogleLojas.lojaId, lojaId), eq(avaliacoesGoogleLojas.grupoId, grupoId))
  let erros = 0
  for (const p of placas) {
    let lugar: LugarPlaces
    try {
      lugar = await deps.buscarLugar(apiKey, p.placeId!)
    } catch (e) {
      erros++
      await exec.update(avaliacoesGoogleLojas)
        .set({ erroSincronizacao: (e as Error).message.slice(0, 300) })
        .where(doGrupo(p.lojaId))
      continue
    }
    const nota = lugar.nota === null ? null : lugar.nota.toFixed(1)
    await exec.update(avaliacoesGoogleLojas)
      .set({ nota, totalAvaliacoes: lugar.total, mapsUri: lugar.mapsUri, sincronizadoEm: agora, erroSincronizacao: null })
      .where(doGrupo(p.lojaId))
    await exec.insert(avaliacoesGoogleHistorico)
      .values({ lojaId: p.lojaId, grupoId, dia: hojeBrt(agora), nota, totalAvaliacoes: lugar.total })
      .onConflictDoUpdate({
        target: [avaliacoesGoogleHistorico.lojaId, avaliacoesGoogleHistorico.dia],
        set: { nota, totalAvaliacoes: lugar.total },
        setWhere: eq(avaliacoesGoogleHistorico.grupoId, grupoId),
      })
    for (const a of lugar.avaliacoes) {
      const campos = {
        autor: a.autor, autorUri: a.autorUri, nota: a.nota, texto: a.texto,
        publicadaEm: a.publicadaEm ? new Date(a.publicadaEm) : null, vistaEm: agora,
      }
      await exec.insert(avaliacoesGoogle)
        .values({ grupoId, lojaId: p.lojaId, googleId: a.googleId, ...campos })
        .onConflictDoUpdate({
          target: [avaliacoesGoogle.lojaId, avaliacoesGoogle.googleId],
          set: campos,
          setWhere: eq(avaliacoesGoogle.grupoId, grupoId),
        })
    }
  }
  return { lojas: placas.length, erros }
}

/** Apaga o conteúdo do Google com mais de 30 dias, de todos os grupos. */
export async function limparConteudoVencido(exec: Executor = db, agora: Date = new Date()): Promise<void> {
  const limite = new Date(agora.getTime() - DIAS_RETENCAO * 86_400_000)
  await exec.delete(avaliacoesGoogle).where(lt(avaliacoesGoogle.vistaEm, limite))
  await exec.delete(avaliacoesGoogleHistorico).where(lt(avaliacoesGoogleHistorico.dia, hojeBrt(limite)))
}

/** Cron diário: todos os grupos com chave configurada, e a limpeza dos 30 dias. */
export async function sincronizarTodosOsGrupos(deps: DependenciasSync, exec: Executor = db) {
  const configs = await exec.select({ grupoId: avaliacoesGoogleConfig.grupoId }).from(avaliacoesGoogleConfig)
    .innerJoin(grupos, eq(grupos.id, avaliacoesGoogleConfig.grupoId))
    .where(eq(grupos.ativo, true))
  const porGrupo: Record<string, ResultadoSync> = {}
  for (const c of configs) {
    try {
      porGrupo[c.grupoId] = await sincronizarGrupo(c.grupoId, deps, exec)
    } catch (e) {
      // Chave que não decifra (CERT_MASTER_KEY trocada) não pode parar os outros grupos.
      console.error(`[avaliacoes-google] grupo ${c.grupoId}: ${(e as Error).message}`)
      porGrupo[c.grupoId] = { lojas: 0, erros: 1 }
    }
  }
  await limparConteudoVencido(exec)
  return porGrupo
}


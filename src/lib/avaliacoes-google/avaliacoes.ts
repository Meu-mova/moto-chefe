import { and, asc, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  avaliacoesGoogle, avaliacoesGoogleConfig, avaliacoesGoogleHistorico, avaliacoesGoogleLojas,
  avaliacoesGooglePlacas, avaliacoesGoogleToques, grupos, lojas, usuarios,
} from '@/lib/db/schema'
import { cifrar, decifrar } from '@/lib/cripto'
import { grupoEstaNaConta } from '@/lib/conta'
import { hojeBrt, inicioDoDiaBrt, mesBrt } from '@/lib/data-venda'
import { listarUsuariosDoGrupo } from '@/lib/usuarios-do-grupo'
import {
  codigoPlacaValido, gerarCodigoPlaca, linkEscreverAvaliacao, placeIdValido, type LugarPlaces,
} from './places'

/**
 * Avaliações do Google por loja e as plaquinhas NFC/QR, cada uma de uma loja e,
 * opcionalmente, de um vendedor, para medir o uso de cada placa e de cada pessoa.
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

async function lojaDoGrupo(lojaId: string, grupoId: string, exec: Executor): Promise<boolean> {
  const [loja] = await exec.select({ id: lojas.id }).from(lojas)
    .where(and(eq(lojas.id, lojaId), eq(lojas.grupoId, grupoId))).limit(1)
  return !!loja
}

/** Responsável da placa: usuário ativo do grupo (mesma posse do seletor, dentro da Conta). */
async function responsavelDoGrupo(usuarioId: string, grupoId: string, exec: Executor): Promise<boolean> {
  const doGrupo = await listarUsuariosDoGrupo(grupoId, {}, exec)
  if (!doGrupo.some(u => u.id === usuarioId)) return false
  const [u] = await exec.select({ ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1)
  return u?.ativo === true
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
 * Liga a loja à ficha dela no Google. As placas da loja não mudam: a tag já gravada continua
 * valendo se o Place ID for trocado. Place ID vazio desliga a leitura e o redirecionamento.
 */
export async function salvarPlaceIdLoja(
  usuario: Usuario,
  data: { grupoId: string; lojaId: string; placeId: string },
  exec: Executor = db,
): Promise<Resultado> {
  const naoEncontrada = { ok: false as const, erro: 'Loja não encontrada' }
  if (!(await grupoDoUsuario(usuario, data.grupoId, exec))) return naoEncontrada
  if (!(await lojaDoGrupo(data.lojaId, data.grupoId, exec))) return naoEncontrada

  const placeId = data.placeId.trim() || null
  if (placeId && !placeIdValido(placeId)) return { ok: false, erro: 'Place ID em formato inválido' }

  const [atual] = await exec.select({ grupoId: avaliacoesGoogleLojas.grupoId, placeId: avaliacoesGoogleLojas.placeId })
    .from(avaliacoesGoogleLojas).where(eq(avaliacoesGoogleLojas.lojaId, data.lojaId)).limit(1)
  // Linha de outro grupo (loja que mudou de grupo): não reaproveita, para não levar histórico junto.
  if (atual && atual.grupoId !== data.grupoId) return naoEncontrada

  const trocouFicha = atual?.placeId !== placeId
  const limpaLeitura = trocouFicha
    ? { nota: null, totalAvaliacoes: null, mapsUri: null, sincronizadoEm: null, erroSincronizacao: null }
    : {}
  await exec.insert(avaliacoesGoogleLojas)
    .values({ lojaId: data.lojaId, grupoId: data.grupoId, placeId })
    .onConflictDoUpdate({
      target: avaliacoesGoogleLojas.lojaId,
      set: { placeId, ...limpaLeitura },
      setWhere: eq(avaliacoesGoogleLojas.grupoId, data.grupoId),
    })
  if (atual && trocouFicha) {
    // Avaliações e histórico eram da ficha antiga.
    await exec.delete(avaliacoesGoogle).where(and(eq(avaliacoesGoogle.lojaId, data.lojaId), eq(avaliacoesGoogle.grupoId, data.grupoId)))
    await exec.delete(avaliacoesGoogleHistorico).where(and(eq(avaliacoesGoogleHistorico.lojaId, data.lojaId), eq(avaliacoesGoogleHistorico.grupoId, data.grupoId)))
  }
  return { ok: true }
}

const nomeDaPlaca = (nome: string | null | undefined) => nome?.trim().slice(0, 60) || null

/** Nova placa da loja; `usuarioId` null = placa do balcão, sem vendedor. */
export async function criarPlaca(
  usuario: Usuario,
  data: { grupoId: string; lojaId: string; usuarioId: string | null; nome?: string | null },
  exec: Executor = db,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (!(await grupoDoUsuario(usuario, data.grupoId, exec))) return { ok: false, erro: 'Loja não encontrada' }
  if (!(await lojaDoGrupo(data.lojaId, data.grupoId, exec))) return { ok: false, erro: 'Loja não encontrada' }
  if (data.usuarioId && !(await responsavelDoGrupo(data.usuarioId, data.grupoId, exec))) {
    return { ok: false, erro: 'Vendedor não encontrado' }
  }
  const [placa] = await exec.insert(avaliacoesGooglePlacas).values({
    grupoId: data.grupoId, lojaId: data.lojaId, usuarioId: data.usuarioId,
    nome: nomeDaPlaca(data.nome), codigo: gerarCodigoPlaca(), criadoPor: usuario.id ?? null,
  }).returning({ id: avaliacoesGooglePlacas.id })
  return { ok: true, id: placa.id }
}

/**
 * Troca o responsável, o nome ou liga/desliga a placa. O código não muda (a tag continua
 * valendo) e os toques antigos ficam com quem era o responsável na hora.
 */
export async function editarPlaca(
  usuario: Usuario,
  data: { grupoId: string; placaId: string; usuarioId?: string | null; nome?: string | null; ativa?: boolean },
  exec: Executor = db,
): Promise<Resultado> {
  const naoEncontrada = { ok: false as const, erro: 'Placa não encontrada' }
  if (!(await grupoDoUsuario(usuario, data.grupoId, exec))) return naoEncontrada
  const daPlaca = and(eq(avaliacoesGooglePlacas.id, data.placaId), eq(avaliacoesGooglePlacas.grupoId, data.grupoId))
  const [placa] = await exec.select({ id: avaliacoesGooglePlacas.id }).from(avaliacoesGooglePlacas).where(daPlaca).limit(1)
  if (!placa) return naoEncontrada
  if (data.usuarioId && !(await responsavelDoGrupo(data.usuarioId, data.grupoId, exec))) {
    return { ok: false, erro: 'Vendedor não encontrado' }
  }
  const set: Partial<typeof avaliacoesGooglePlacas.$inferInsert> = {}
  if (data.usuarioId !== undefined) set.usuarioId = data.usuarioId
  if (data.nome !== undefined) set.nome = nomeDaPlaca(data.nome)
  if (data.ativa !== undefined) set.ativa = data.ativa
  if (Object.keys(set).length) await exec.update(avaliacoesGooglePlacas).set(set).where(daPlaca)
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

export type Toques = { nfc: number; qr: number }

export type LojaPainel = {
  lojaId: string
  nome: string
  placeId: string | null
  nota: number | null
  total: number | null
  mapsUri: string | null
  sincronizadoEm: string | null
  erro: string | null
  /** Diferença para a foto mais antiga dos últimos 30 dias; null sem histórico. */
  variacao: { nota: number | null; total: number | null; desde: string } | null
  /** Toques de todas as placas da loja no mês escolhido. */
  toquesMes: Toques
  avaliacoes: AvaliacaoTela[]
}

export type PlacaPainel = {
  id: string
  lojaId: string
  lojaNome: string
  usuarioId: string | null
  usuarioNome: string | null
  nome: string | null
  codigo: string
  ativa: boolean
  toquesMes: Toques
  toquesTotal: number
}

/** Toques do mês por responsável na hora do toque; usuarioId null = placa de balcão. */
export type ResponsavelPainel = { usuarioId: string | null; nome: string; lojaId: string; lojaNome: string; toques: Toques }

export type PainelAvaliacoes = {
  temChave: boolean
  /** 'YYYY-MM' (Brasília) dos toques mostrados. */
  mes: string
  lojas: LojaPainel[]
  placas: PlacaPainel[]
  porResponsavel: ResponsavelPainel[]
  /** Quem pode ser dono de placa: usuários ativos do grupo. */
  responsaveis: { id: string; nome: string }[]
}

const num = (v: string | null) => (v === null ? null : Number(v))

function proximoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

function somar(linhas: { origem: 'nfc' | 'qr'; n: number }[]): Toques {
  const t = { nfc: 0, qr: 0 }
  for (const l of linhas) t[l.origem] += l.n
  return t
}

export async function painelAvaliacoes(
  usuario: Usuario,
  grupoId: string,
  exec: Executor = db,
  opcoes: { mes?: string; agora?: Date } = {},
): Promise<PainelAvaliacoes | null> {
  if (!(await grupoDoUsuario(usuario, grupoId, exec))) return null

  const mes = opcoes.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(opcoes.mes) ? opcoes.mes : mesBrt(opcoes.agora)
  const inicio = inicioDoDiaBrt(`${mes}-01`).toISOString()
  const fim = inicioDoDiaBrt(`${proximoMes(mes)}-01`).toISOString()
  const doMes = and(
    eq(avaliacoesGoogleToques.grupoId, grupoId),
    gte(avaliacoesGoogleToques.criadoEm, sql`${inicio}::timestamptz`),
    lt(avaliacoesGoogleToques.criadoEm, sql`${fim}::timestamptz`),
  )

  const [config, linhas, historico, placas, toquesPlacaMes, toquesPlacaTotal, toquesResp, avaliacoes, doGrupo] = await Promise.all([
    exec.select({ grupoId: avaliacoesGoogleConfig.grupoId }).from(avaliacoesGoogleConfig)
      .where(eq(avaliacoesGoogleConfig.grupoId, grupoId)).limit(1),
    exec.select({
      lojaId: lojas.id, nome: lojas.nome,
      placeId: avaliacoesGoogleLojas.placeId,
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
      id: avaliacoesGooglePlacas.id, lojaId: avaliacoesGooglePlacas.lojaId, lojaNome: lojas.nome,
      usuarioId: avaliacoesGooglePlacas.usuarioId, usuarioNome: usuarios.nome,
      nome: avaliacoesGooglePlacas.nome, codigo: avaliacoesGooglePlacas.codigo, ativa: avaliacoesGooglePlacas.ativa,
    })
      .from(avaliacoesGooglePlacas)
      .innerJoin(lojas, eq(lojas.id, avaliacoesGooglePlacas.lojaId))
      .leftJoin(usuarios, eq(usuarios.id, avaliacoesGooglePlacas.usuarioId))
      .where(eq(avaliacoesGooglePlacas.grupoId, grupoId))
      .orderBy(desc(avaliacoesGooglePlacas.ativa), asc(lojas.nome), asc(usuarios.nome), asc(avaliacoesGooglePlacas.criadoEm)),
    exec.select({ placaId: avaliacoesGoogleToques.placaId, origem: avaliacoesGoogleToques.origem, n: sql<number>`count(*)::int` })
      .from(avaliacoesGoogleToques).where(doMes)
      .groupBy(avaliacoesGoogleToques.placaId, avaliacoesGoogleToques.origem),
    exec.select({ placaId: avaliacoesGoogleToques.placaId, n: sql<number>`count(*)::int` })
      .from(avaliacoesGoogleToques).where(eq(avaliacoesGoogleToques.grupoId, grupoId))
      .groupBy(avaliacoesGoogleToques.placaId),
    exec.select({
      usuarioId: avaliacoesGoogleToques.usuarioId, usuarioNome: usuarios.nome,
      lojaId: avaliacoesGoogleToques.lojaId, lojaNome: lojas.nome,
      origem: avaliacoesGoogleToques.origem, n: sql<number>`count(*)::int`,
    })
      .from(avaliacoesGoogleToques)
      .innerJoin(lojas, eq(lojas.id, avaliacoesGoogleToques.lojaId))
      .leftJoin(usuarios, eq(usuarios.id, avaliacoesGoogleToques.usuarioId))
      .where(doMes)
      .groupBy(avaliacoesGoogleToques.usuarioId, usuarios.nome, avaliacoesGoogleToques.lojaId, lojas.nome, avaliacoesGoogleToques.origem),
    exec.select({
      lojaId: avaliacoesGoogle.lojaId, googleId: avaliacoesGoogle.googleId, autor: avaliacoesGoogle.autor,
      autorUri: avaliacoesGoogle.autorUri, nota: avaliacoesGoogle.nota, texto: avaliacoesGoogle.texto,
      publicadaEm: avaliacoesGoogle.publicadaEm,
    })
      .from(avaliacoesGoogle)
      .where(eq(avaliacoesGoogle.grupoId, grupoId))
      .orderBy(desc(avaliacoesGoogle.publicadaEm)),
    listarUsuariosDoGrupo(grupoId, {}, exec),
  ])

  const ativos = doGrupo.length
    ? new Set((await exec.select({ id: usuarios.id }).from(usuarios)
        .where(and(eq(usuarios.ativo, true), sql`${usuarios.id} = any(${sql.param(doGrupo.map(u => u.id))}::uuid[])`))).map(u => u.id))
    : new Set<string>()

  const placasPainel: PlacaPainel[] = placas.map(p => ({
    ...p,
    toquesMes: somar(toquesPlacaMes.filter(t => t.placaId === p.id)),
    toquesTotal: toquesPlacaTotal.find(t => t.placaId === p.id)?.n ?? 0,
  }))

  const porResponsavel = new Map<string, ResponsavelPainel>()
  for (const t of toquesResp) {
    const chave = `${t.usuarioId ?? 'balcao'}|${t.lojaId}`
    const r = porResponsavel.get(chave) ?? {
      usuarioId: t.usuarioId, nome: t.usuarioNome ?? 'Balcão (sem vendedor)',
      lojaId: t.lojaId, lojaNome: t.lojaNome, toques: { nfc: 0, qr: 0 },
    }
    r.toques[t.origem] += t.n
    porResponsavel.set(chave, r)
  }

  return {
    temChave: config.length > 0,
    mes,
    placas: placasPainel,
    porResponsavel: [...porResponsavel.values()]
      .sort((a, b) => (b.toques.nfc + b.toques.qr) - (a.toques.nfc + a.toques.qr) || a.nome.localeCompare(b.nome)),
    responsaveis: doGrupo.filter(u => ativos.has(u.id)),
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
      const daLoja = placasPainel.filter(p => p.lojaId === l.lojaId)
      return {
        lojaId: l.lojaId,
        nome: l.nome,
        placeId: l.placeId ?? null,
        nota,
        total: l.total ?? null,
        mapsUri: l.mapsUri ?? null,
        sincronizadoEm: l.sincronizadoEm?.toISOString() ?? null,
        erro: l.erro ?? null,
        variacao,
        toquesMes: {
          nfc: daLoja.reduce((s, p) => s + p.toquesMes.nfc, 0),
          qr: daLoja.reduce((s, p) => s + p.toquesMes.qr, 0),
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
 * devolve o link do Google para redirecionar, ou null se a placa não existe ou a loja ainda
 * não tem ficha do Google. Placa desativada leva ao Google, mas não conta toque.
 */
export async function registrarToque(
  codigo: string,
  origem: 'nfc' | 'qr',
  exec: Executor = db,
): Promise<string | null> {
  if (!codigoPlacaValido(codigo)) return null
  const [placa] = await exec.select({
    id: avaliacoesGooglePlacas.id, lojaId: avaliacoesGooglePlacas.lojaId, grupoId: avaliacoesGooglePlacas.grupoId,
    usuarioId: avaliacoesGooglePlacas.usuarioId, ativa: avaliacoesGooglePlacas.ativa, placeId: avaliacoesGoogleLojas.placeId,
  })
    .from(avaliacoesGooglePlacas)
    .innerJoin(avaliacoesGoogleLojas, and(
      eq(avaliacoesGoogleLojas.lojaId, avaliacoesGooglePlacas.lojaId),
      eq(avaliacoesGoogleLojas.grupoId, avaliacoesGooglePlacas.grupoId),
    ))
    .where(eq(avaliacoesGooglePlacas.codigo, codigo)).limit(1)
  if (!placa?.placeId) return null
  if (placa.ativa) {
    await exec.insert(avaliacoesGoogleToques).values({
      placaId: placa.id, lojaId: placa.lojaId, grupoId: placa.grupoId, usuarioId: placa.usuarioId, origem,
    })
  }
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

  const fichas = await exec.select({ lojaId: avaliacoesGoogleLojas.lojaId, placeId: avaliacoesGoogleLojas.placeId })
    .from(avaliacoesGoogleLojas)
    .innerJoin(lojas, eq(lojas.id, avaliacoesGoogleLojas.lojaId))
    .where(and(
      eq(avaliacoesGoogleLojas.grupoId, grupoId), eq(lojas.grupoId, grupoId),
      eq(lojas.ativa, true), isNotNull(avaliacoesGoogleLojas.placeId),
    ))

  const doGrupo = (lojaId: string) => and(eq(avaliacoesGoogleLojas.lojaId, lojaId), eq(avaliacoesGoogleLojas.grupoId, grupoId))
  let erros = 0
  for (const f of fichas) {
    let lugar: LugarPlaces
    try {
      lugar = await deps.buscarLugar(apiKey, f.placeId!)
    } catch (e) {
      erros++
      await exec.update(avaliacoesGoogleLojas)
        .set({ erroSincronizacao: (e as Error).message.slice(0, 300) })
        .where(doGrupo(f.lojaId))
      continue
    }
    const nota = lugar.nota === null ? null : lugar.nota.toFixed(1)
    await exec.update(avaliacoesGoogleLojas)
      .set({ nota, totalAvaliacoes: lugar.total, mapsUri: lugar.mapsUri, sincronizadoEm: agora, erroSincronizacao: null })
      .where(doGrupo(f.lojaId))
    await exec.insert(avaliacoesGoogleHistorico)
      .values({ lojaId: f.lojaId, grupoId, dia: hojeBrt(agora), nota, totalAvaliacoes: lugar.total })
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
        .values({ grupoId, lojaId: f.lojaId, googleId: a.googleId, ...campos })
        .onConflictDoUpdate({
          target: [avaliacoesGoogle.lojaId, avaliacoesGoogle.googleId],
          set: campos,
          setWhere: eq(avaliacoesGoogle.grupoId, grupoId),
        })
    }
  }
  return { lojas: fichas.length, erros }
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

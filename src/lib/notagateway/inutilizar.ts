import { and, count, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, lojas, notasFiscaisSaida, notasFiscaisSaidaInutilizacoes } from '@/lib/db/schema'
import { podeVerGrupo } from '@/lib/acesso-grupo'
import { registrarAcaoSensivel } from '@/lib/log-acoes'
import { semZerosAEsquerda } from '@/lib/texto'
import { configNotaGateway, type ConfigNotaGateway, consultarInutilizacaoNaNg, InutilizacaoRecusada, NotaGatewayIndisponivel, pedirInutilizacao, type InutilizacaoConsultada } from './client'
import { ambienteLiberado } from './ambiente'
import {
  type ContextoInutilizacao, decidirInutilizacao, ERRO_JA_PEDIDA, pedidoSemRespostaVenceu, podePedirInutilizacao, situacaoInutilizacao,
  STATUS_NAO_ENVIADA, STATUS_SEM_CONFIGURACAO, validarJustificativa,
} from './inutilizacao'
import { STATUS_MORTOS } from './status'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

export type UsuarioInutilizacao = {
  id: string
  papel: string
  lojaId: string | null
  gruposAcesso?: readonly string[] | null
  contaId: string | null
}

export type Resultado<T> = { ok: true } & T | { ok: false; erro: string }

// Mesma frase para nota de outra Conta e id inexistente: não revela que o registro existe.
const NAO_ENCONTRADA = 'NF não encontrada'

/** Quem pode pedir (podePedirInutilizacao), no grupo da nota. */
async function grupoVisivel(tx: Executor, usuario: UsuarioInutilizacao, grupoId: string): Promise<boolean> {
  if (!podePedirInutilizacao(usuario.papel)) return false
  const [grupo] = await tx.select({ id: grupos.id, contaId: grupos.contaId }).from(grupos)
    .where(and(eq(grupos.id, grupoId), usuario.papel === 'admin_geral' ? undefined : eq(grupos.contaId, usuario.contaId ?? '')))
    .limit(1)
  if (!grupo) return false
  const [propria] = usuario.lojaId
    ? await tx.select({ grupoId: lojas.grupoId }).from(lojas).where(eq(lojas.id, usuario.lojaId)).limit(1)
    : []
  return podeVerGrupo({ papel: usuario.papel, gruposAcesso: usuario.gruposAcesso ? [...usuario.gruposAcesso] : null, contaId: usuario.contaId }, propria?.grupoId ?? null, grupo)
}

export type PedidoInutilizacao = {
  inutilizacaoId: string; grupoId: string; idExterno: string; ambiente: string
  serie: string; numeroInicial: number; numeroFinal: number; justificativa: string; numeroVenda: number
}

export type EscopoInutilizacao = { grupoId: string; ambiente: string }

type NotaDaDecisao = ContextoInutilizacao['nota']

/**
 * Contexto da decisão (decidirInutilizacao) para notas do mesmo grupo e ambiente, numa
 * ida só ao banco: o pedido passa uma nota, a lista passa as recusadas visíveis. O grupo
 * vai no where das três consultas; o SQL só traz candidatos (o `ltrim` é a mesma regra de
 * semZerosAEsquerda) e a regra pura decide.
 */
export async function contextoDeInutilizacao(
  tx: Pick<typeof db, 'select'>, escopo: EscopoInutilizacao, notas: NotaDaDecisao[],
): Promise<Map<string, ContextoInutilizacao>> {
  const numeros = [...new Set(notas.map(n => semZerosAEsquerda(n.numero)).filter(Boolean))]
  const inteiros = numeros.map(Number).filter(Number.isInteger)
  const vendas = [...new Set(notas.flatMap(n => (n.vendaId ? [n.vendaId] : [])))]
  const doEscopo = and(eq(notasFiscaisSaida.grupoId, escopo.grupoId), eq(notasFiscaisSaida.ambiente, escopo.ambiente))

  const comMesmoNumero = numeros.length === 0 ? [] : await tx.select({
    id: notasFiscaisSaida.id, numero: notasFiscaisSaida.numero, serie: notasFiscaisSaida.serie,
    status: notasFiscaisSaida.status, motivoStatus: notasFiscaisSaida.motivoStatus,
  }).from(notasFiscaisSaida).where(and(doEscopo, inArray(sql`ltrim(${notasFiscaisSaida.numero}, '0')`, numeros)))
  const vivasDasVendas = vendas.length === 0 ? [] : await tx.select({
    id: notasFiscaisSaida.id, vendaId: notasFiscaisSaida.vendaId, numero: notasFiscaisSaida.numero,
  }).from(notasFiscaisSaida).where(and(doEscopo, inArray(notasFiscaisSaida.vendaId, vendas), notInArray(notasFiscaisSaida.status, STATUS_MORTOS)))
  const pedidos = inteiros.length === 0 ? [] : await tx.select({
    situacao: notasFiscaisSaidaInutilizacoes.situacao, motivoStatus: notasFiscaisSaidaInutilizacoes.motivoStatus, serie: notasFiscaisSaidaInutilizacoes.serie,
    numeroInicial: notasFiscaisSaidaInutilizacoes.numeroInicial, criadoEm: notasFiscaisSaidaInutilizacoes.criadoEm,
  }).from(notasFiscaisSaidaInutilizacoes).where(and(
    eq(notasFiscaisSaidaInutilizacoes.grupoId, escopo.grupoId), eq(notasFiscaisSaidaInutilizacoes.ambiente, escopo.ambiente),
    inArray(notasFiscaisSaidaInutilizacoes.numeroInicial, inteiros),
  ))

  return new Map(notas.map(n => [n.id, {
    nota: n,
    outraNotaVivaDaVenda: vivasDasVendas.find(v => v.vendaId === n.vendaId && v.id !== n.id) ?? null,
    outrasNotas: comMesmoNumero,
    pedidos,
  }]))
}

/** Confere permissão e a decisão (a mesma da lista) e grava o pedido como pendente, antes de chamar a NG. */
export async function prepararInutilizacao(
  tx: Executor, usuario: UsuarioInutilizacao, notaId: string, justificativaBruta: string,
): Promise<Resultado<{ pedido: PedidoInutilizacao }>> {
  const filtroConta = usuario.papel === 'admin_geral' ? undefined : eq(grupos.contaId, usuario.contaId ?? '')
  const [nota] = await tx.select({
    id: notasFiscaisSaida.id, grupoId: notasFiscaisSaida.grupoId, vendaId: notasFiscaisSaida.vendaId, vendaNumero: notasFiscaisSaida.vendaNumero,
    idExterno: notasFiscaisSaida.idExterno, ambiente: notasFiscaisSaida.ambiente, status: notasFiscaisSaida.status,
    motivoStatus: notasFiscaisSaida.motivoStatus, numero: notasFiscaisSaida.numero, serie: notasFiscaisSaida.serie,
  }).from(notasFiscaisSaida).innerJoin(grupos, eq(grupos.id, notasFiscaisSaida.grupoId))
    .where(and(eq(notasFiscaisSaida.id, notaId), filtroConta)).limit(1)
  if (!nota || !(await grupoVisivel(tx, usuario, nota.grupoId))) return { ok: false, erro: NAO_ENCONTRADA }

  const decisao = decidirInutilizacao((await contextoDeInutilizacao(tx, nota, [nota])).get(nota.id)!)
  if (decisao.tipo !== 'pode') return { ok: false, erro: decisao.erro }
  const j = validarJustificativa(justificativaBruta)
  if (!j.ok) return { ok: false, erro: j.erro }

  const [{ n }] = await tx.select({ n: count() }).from(notasFiscaisSaidaInutilizacoes).where(eq(notasFiscaisSaidaInutilizacoes.notaId, nota.id))
  const idExterno = `${nota.idExterno}-inut-${n + 1}`
  // Duas abas pedindo o mesmo número ao mesmo tempo: o índice único parcial barra a segunda.
  const [linha] = await tx.insert(notasFiscaisSaidaInutilizacoes).values({
    notaId: nota.id, grupoId: nota.grupoId, idExterno, ambiente: nota.ambiente, serie: decisao.serie,
    numeroInicial: decisao.numero, numeroFinal: decisao.numero, justificativa: j.justificativa, pedidaPor: usuario.id,
  }).onConflictDoNothing().returning({ id: notasFiscaisSaidaInutilizacoes.id })
  if (!linha) return { ok: false, erro: ERRO_JA_PEDIDA }
  return { ok: true, pedido: {
    inutilizacaoId: linha.id, grupoId: nota.grupoId, idExterno, ambiente: nota.ambiente, serie: decisao.serie,
    numeroInicial: decisao.numero, numeroFinal: decisao.numero, justificativa: j.justificativa, numeroVenda: nota.vendaNumero,
  } }
}

/** Grava o que a NG respondeu (recusa do envio ou consulta), sempre com o grupo no where. */
export async function gravarResultadoDaInutilizacao(
  tx: Executor, inutilizacao: { id: string; grupoId: string }, r: InutilizacaoConsultada,
): Promise<void> {
  await tx.update(notasFiscaisSaidaInutilizacoes).set({
    status: r.status, situacao: situacaoInutilizacao(r.status), motivoStatus: r.motivoStatus, protocolo: r.protocolo,
    atualizadoEm: sql`now()` as unknown as Date,
  }).where(and(eq(notasFiscaisSaidaInutilizacoes.id, inutilizacao.id), eq(notasFiscaisSaidaInutilizacoes.grupoId, inutilizacao.grupoId)))
}

export async function inutilizacaoDoUsuario(tx: Executor, usuario: UsuarioInutilizacao, inutilizacaoId: string) {
  const filtroConta = usuario.papel === 'admin_geral' ? undefined : eq(grupos.contaId, usuario.contaId ?? '')
  const [linha] = await tx.select({
    id: notasFiscaisSaidaInutilizacoes.id, grupoId: notasFiscaisSaidaInutilizacoes.grupoId, idExterno: notasFiscaisSaidaInutilizacoes.idExterno,
    ambiente: notasFiscaisSaidaInutilizacoes.ambiente, situacao: notasFiscaisSaidaInutilizacoes.situacao, status: notasFiscaisSaidaInutilizacoes.status,
    motivoStatus: notasFiscaisSaidaInutilizacoes.motivoStatus, protocolo: notasFiscaisSaidaInutilizacoes.protocolo,
    criadoEm: notasFiscaisSaidaInutilizacoes.criadoEm,
  }).from(notasFiscaisSaidaInutilizacoes).innerJoin(grupos, eq(grupos.id, notasFiscaisSaidaInutilizacoes.grupoId))
    .where(and(eq(notasFiscaisSaidaInutilizacoes.id, inutilizacaoId), filtroConta)).limit(1)
  if (!linha || !(await grupoVisivel(tx, usuario, linha.grupoId))) return null
  return linha
}

async function configDoAmbiente(grupoId: string, ambiente: string): Promise<{ cfg: ConfigNotaGateway } | { erro: string }> {
  const cfg = await configNotaGateway(grupoId)
  if (!cfg) return { erro: 'Nota Gateway não configurada para esta empresa.' }
  if (cfg.ambiente !== ambiente) return { erro: 'O ambiente da empresa mudou desde a emissão desta nota.' }
  return { cfg }
}

/** O que a casca pede de fora; o teste de banco troca a NG, a configuração e a transação. */
export type DependenciasInutilizacao = {
  exec: Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>
  config: (grupoId: string, ambiente: string) => Promise<{ cfg: ConfigNotaGateway } | { erro: string }>
  enviar: typeof pedirInutilizacao
  vercelEnv: string | undefined
}

const DEPENDENCIAS: DependenciasInutilizacao = { exec: db, config: configDoAmbiente, enviar: pedirInutilizacao, vercelEnv: process.env.VERCEL_ENV }

export const AVISO_SEM_RESPOSTA = 'A Nota Gateway não respondeu. O pedido ficou pendente: confira o resultado mais tarde.'

type ResultadoDoEnvio = 'enviado' | 'sem_resposta' | 'recusado'

/**
 * Pede a inutilização à NG; o resultado chega depois, por consultarInutilizacao. Todo
 * pedido vai ao log com o resultado (C7): só o que o pedido tem, nunca token nem empresaId.
 */
export async function inutilizarNumeroDaNota(
  usuario: UsuarioInutilizacao, notaId: string, justificativa: string, deps: DependenciasInutilizacao = DEPENDENCIAS,
): Promise<Resultado<{ inutilizacaoId: string; aviso: string | null }>> {
  const { exec } = deps
  const preparo = await prepararInutilizacao(exec, usuario, notaId, justificativa)
  if (!preparo.ok) return preparo
  const { pedido } = preparo
  const registrar = (resultado: ResultadoDoEnvio, motivo?: string) => registrarAcaoSensivel({
    tipo: 'nf_emitida', usuarioId: usuario.id, grupoId: pedido.grupoId,
    detalhe: {
      origem: 'mova', etapa: 'inutilizacao', resultado, ...(motivo ? { motivo } : {}), notaId, inutilizacaoId: pedido.inutilizacaoId,
      numeroVenda: pedido.numeroVenda, ambiente: pedido.ambiente, serie: pedido.serie, numero: pedido.numeroInicial,
    },
  }, exec)
  // Depois do envio o pedido já existe na NG: erro no log vira só console.error, não desfaz a resposta.
  const registrarSemFalhar = async (resultado: ResultadoDoEnvio) => {
    try {
      await registrar(resultado)
    } catch (e) {
      console.error('[inutilizacao] falha ao registrar o pedido no log:', e instanceof Error ? e.message : e)
    }
  }
  const recusar = async (status: string, motivo: string) => {
    await gravarResultadoDaInutilizacao(exec, { id: pedido.inutilizacaoId, grupoId: pedido.grupoId }, { status, motivoStatus: motivo, protocolo: null })
    await registrar('recusado', motivo)
    return { ok: false as const, erro: motivo }
  }

  const c = await deps.config(pedido.grupoId, pedido.ambiente)
  if ('erro' in c) return recusar(STATUS_SEM_CONFIGURACAO, c.erro)
  // O cliente da NG também barra produção fora do deploy de produção, mas lançando; aqui vira recusa e o número fica livre (C6).
  if (!ambienteLiberado(c.cfg.ambiente, deps.vercelEnv)) {
    return recusar(STATUS_SEM_CONFIGURACAO, 'Fora da produção, a Nota Gateway só roda em homologação. O número continua livre.')
  }
  try {
    await deps.enviar(c.cfg, pedido)
  } catch (e) {
    // 4xx: a NG não criou o pedido, então o número fica livre para outro. 5xx ou rede: pode ter criado; segue pendente e a consulta decide.
    if (e instanceof InutilizacaoRecusada) return recusar('InutilizacaoNegada', `A Nota Gateway recusou o pedido: ${e.message}`)
    console.error(`[inutilizacao] Nota Gateway sem resposta (${e instanceof NotaGatewayIndisponivel ? `HTTP ${e.status}` : 'rede'})`)
    await registrarSemFalhar('sem_resposta')
    return { ok: true, inutilizacaoId: pedido.inutilizacaoId, aviso: AVISO_SEM_RESPOSTA }
  }
  await registrarSemFalhar('enviado')
  return { ok: true, inutilizacaoId: pedido.inutilizacaoId, aviso: null }
}

/** Consulta o resultado pelo id e grava status, motivo e protocolo. */
export async function consultarInutilizacao(
  usuario: UsuarioInutilizacao, inutilizacaoId: string,
): Promise<Resultado<{ situacao: string; motivoStatus: string | null; protocolo: string | null }>> {
  const linha = await inutilizacaoDoUsuario(db, usuario, inutilizacaoId)
  if (!linha) return { ok: false, erro: 'Inutilização não encontrada' }
  if (linha.situacao !== 'pendente') return { ok: true, situacao: linha.situacao, motivoStatus: linha.motivoStatus, protocolo: linha.protocolo }
  const c = await configDoAmbiente(linha.grupoId, linha.ambiente)
  if ('erro' in c) return { ok: false, erro: c.erro }
  const r = await consultarInutilizacaoNaNg(c.cfg, linha.idExterno)
  if (!r) {
    if (!pedidoSemRespostaVenceu(linha.criadoEm, new Date())) return { ok: true, situacao: 'pendente', motivoStatus: null, protocolo: null }
    const motivo = 'O pedido não chegou à Nota Gateway. Peça a inutilização de novo.'
    await gravarResultadoDaInutilizacao(db, linha, { status: STATUS_NAO_ENVIADA, motivoStatus: motivo, protocolo: null })
    return { ok: true, situacao: 'negada', motivoStatus: motivo, protocolo: null }
  }
  await gravarResultadoDaInutilizacao(db, linha, r)
  return { ok: true, situacao: situacaoInutilizacao(r.status), motivoStatus: r.motivoStatus, protocolo: r.protocolo }
}

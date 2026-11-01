import { and, count, eq, ne, notInArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, lojas, notasFiscaisSaida, notasFiscaisSaidaInutilizacoes } from '@/lib/db/schema'
import { podeVerGrupo } from '@/lib/acesso-grupo'
import { registrarAcaoSensivel } from '@/lib/log-acoes'
import { configNotaGateway, type ConfigNotaGateway, consultarInutilizacaoNaNg, InutilizacaoRecusada, pedirInutilizacao, type InutilizacaoConsultada } from './client'
import { elegivelParaInutilizar, numeroUsadoEmOutraNota, pedidoSemRespostaVenceu, situacaoInutilizacao, STATUS_NAO_ENVIADA, STATUS_SEM_CONFIGURACAO, validarJustificativa } from './inutilizacao'
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

/** Irreversível na produção: só os sócios e o admin_geral, no grupo da nota (decisão do Luis, #504). */
async function grupoVisivel(tx: Executor, usuario: UsuarioInutilizacao, grupoId: string): Promise<boolean> {
  if (usuario.papel !== 'admin_geral' && usuario.papel !== 'admin_socio') return false
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
  serie: string; numeroInicial: number; numeroFinal: number; justificativa: string
}

/** Confere permissão e elegibilidade e grava o pedido como pendente, antes de chamar a NG. */
export async function prepararInutilizacao(
  tx: Executor, usuario: UsuarioInutilizacao, notaId: string, justificativaBruta: string,
): Promise<Resultado<{ pedido: PedidoInutilizacao }>> {
  const filtroConta = usuario.papel === 'admin_geral' ? undefined : eq(grupos.contaId, usuario.contaId ?? '')
  const [nota] = await tx.select({
    id: notasFiscaisSaida.id, grupoId: notasFiscaisSaida.grupoId, vendaId: notasFiscaisSaida.vendaId, idExterno: notasFiscaisSaida.idExterno,
    ambiente: notasFiscaisSaida.ambiente, status: notasFiscaisSaida.status, motivoStatus: notasFiscaisSaida.motivoStatus,
    numero: notasFiscaisSaida.numero, serie: notasFiscaisSaida.serie,
  }).from(notasFiscaisSaida).innerJoin(grupos, eq(grupos.id, notasFiscaisSaida.grupoId))
    .where(and(eq(notasFiscaisSaida.id, notaId), filtroConta)).limit(1)
  if (!nota || !(await grupoVisivel(tx, usuario, nota.grupoId))) return { ok: false, erro: NAO_ENCONTRADA }

  const [outraViva] = nota.vendaId
    ? await tx.select({ numero: notasFiscaisSaida.numero }).from(notasFiscaisSaida).where(and(
        eq(notasFiscaisSaida.vendaId, nota.vendaId), eq(notasFiscaisSaida.grupoId, nota.grupoId), eq(notasFiscaisSaida.ambiente, nota.ambiente),
        ne(notasFiscaisSaida.id, nota.id), notInArray(notasFiscaisSaida.status, STATUS_MORTOS),
      )).limit(1)
    : []
  const elegivel = elegivelParaInutilizar(nota, outraViva ?? null)
  if (!elegivel.ok) return elegivel
  // ltrim: número e série são texto e podem vir com zero à esquerda.
  const mesmoNumero = await tx.select({ numero: notasFiscaisSaida.numero, status: notasFiscaisSaida.status, motivoStatus: notasFiscaisSaida.motivoStatus })
    .from(notasFiscaisSaida).where(and(
      eq(notasFiscaisSaida.grupoId, nota.grupoId), eq(notasFiscaisSaida.ambiente, nota.ambiente), sql`ltrim(${notasFiscaisSaida.serie}, '0') = ltrim(${elegivel.serie}, '0')`,
      ne(notasFiscaisSaida.id, nota.id), sql`ltrim(${notasFiscaisSaida.numero}, '0') = ${String(elegivel.numero)}`,
    ))
  if (numeroUsadoEmOutraNota(elegivel.numero, mesmoNumero)) {
    return { ok: false, erro: `O número ${elegivel.numero} está em outra nota deste grupo que já usou o número na SEFAZ. Não há o que inutilizar.` }
  }
  const j = validarJustificativa(justificativaBruta)
  if (!j.ok) return { ok: false, erro: j.erro }

  const [jaPedida] = await tx.select({ id: notasFiscaisSaidaInutilizacoes.id }).from(notasFiscaisSaidaInutilizacoes).where(and(
    eq(notasFiscaisSaidaInutilizacoes.grupoId, nota.grupoId), eq(notasFiscaisSaidaInutilizacoes.ambiente, nota.ambiente),
    eq(notasFiscaisSaidaInutilizacoes.serie, elegivel.serie), eq(notasFiscaisSaidaInutilizacoes.numeroInicial, elegivel.numero),
    ne(notasFiscaisSaidaInutilizacoes.situacao, 'negada'),
  )).limit(1)
  if (jaPedida) return { ok: false, erro: 'Este número já tem um pedido de inutilização.' }

  const [{ n }] = await tx.select({ n: count() }).from(notasFiscaisSaidaInutilizacoes).where(eq(notasFiscaisSaidaInutilizacoes.notaId, nota.id))
  const idExterno = `${nota.idExterno}-inut-${n + 1}`
  const [linha] = await tx.insert(notasFiscaisSaidaInutilizacoes).values({
    notaId: nota.id, grupoId: nota.grupoId, idExterno, ambiente: nota.ambiente, serie: elegivel.serie,
    numeroInicial: elegivel.numero, numeroFinal: elegivel.numero, justificativa: j.justificativa, pedidaPor: usuario.id,
  }).onConflictDoNothing().returning({ id: notasFiscaisSaidaInutilizacoes.id })
  if (!linha) return { ok: false, erro: 'Este número já tem um pedido de inutilização.' }
  return { ok: true, pedido: {
    inutilizacaoId: linha.id, grupoId: nota.grupoId, idExterno, ambiente: nota.ambiente,
    serie: elegivel.serie, numeroInicial: elegivel.numero, numeroFinal: elegivel.numero, justificativa: j.justificativa,
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

/** Pede a inutilização à NG. O resultado chega depois, por consultarInutilizacao. */
export async function inutilizarNumeroDaNota(
  usuario: UsuarioInutilizacao, notaId: string, justificativa: string,
): Promise<Resultado<{ inutilizacaoId: string }>> {
  const preparo = await prepararInutilizacao(db, usuario, notaId, justificativa)
  if (!preparo.ok) return preparo
  const { pedido } = preparo
  const c = await configDoAmbiente(pedido.grupoId, pedido.ambiente)
  const recusar = async (status: string, motivo: string) => {
    await gravarResultadoDaInutilizacao(db, { id: pedido.inutilizacaoId, grupoId: pedido.grupoId }, { status, motivoStatus: motivo, protocolo: null })
    return { ok: false as const, erro: motivo }
  }
  if ('erro' in c) return recusar(STATUS_SEM_CONFIGURACAO, c.erro)
  try {
    await pedirInutilizacao(c.cfg, pedido)
  } catch (e) {
    // 4xx: a NG não criou o pedido, então o número fica livre para outro. 5xx ou rede: segue pendente e a consulta decide.
    if (e instanceof InutilizacaoRecusada) return recusar('InutilizacaoNegada', `A Nota Gateway recusou o pedido: ${e.message}`)
    // Só aqui o pedido já está gravado: a mensagem do cliente da NG não leva token nem empresaId.
    console.error('[inutilizacao] envio sem resposta da Nota Gateway:', (e as Error).message)
    return { ok: false, erro: 'A Nota Gateway não respondeu. O pedido ficou pendente; confira o resultado mais tarde.' }
  }
  await registrarAcaoSensivel({
    tipo: 'nf_emitida', usuarioId: usuario.id, grupoId: pedido.grupoId,
    detalhe: { origem: 'mova', etapa: 'inutilizacao', notaId, inutilizacaoId: pedido.inutilizacaoId, ambiente: pedido.ambiente, serie: pedido.serie, numero: pedido.numeroInicial },
  })
  return { ok: true, inutilizacaoId: pedido.inutilizacaoId }
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

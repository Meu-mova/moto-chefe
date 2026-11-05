import { createHash } from 'node:crypto'
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, notasFiscaisSaida, notasFiscaisSaidaInutilizacoes } from '@/lib/db/schema'
import { semZerosAEsquerda } from '@/lib/texto'
import { ambienteLiberado, FORA_DA_PRODUCAO } from './ambiente'
import { pedirInutilizacao, serieEUfDaEmpresaNaNg, type ConfigNotaGateway } from './client'
import { conflitosDaFaixa, FAIXAS_NO_HISTORICO, ufPermiteInutilizacao, validarFaixaInutilizacao, type FaixaInutilizacao } from './inutilizacao'
import { configDoAmbiente, enviarPedido, grupoVisivel, lerConfigDoAmbiente, type DependenciasInutilizacao, type PedidoInutilizacao, type Resultado, type UsuarioInutilizacao } from './inutilizar'

// Mesma frase para grupo de outra Conta, grupo inexistente e papel sem permissão: não revela que o grupo existe.
const NAO_ENCONTRADO = 'Grupo não encontrado'
const ERRO_EMPRESA = 'Não deu para ler a série e a UF da empresa na Nota Gateway.'
const ERRO_UF = 'A inutilização não está disponível para empresas do Acre, Bahia ou São Paulo.'
const ERRO_TENTATIVA = 'Tentativa inválida. Atualize a página e abra o diálogo de novo.'
const ERRO_CHAVE_REUSADA = 'Esta tentativa já foi usada com outra faixa. Feche o diálogo e confira o histórico.'
const AVISO_REPETIDA = 'Esta tentativa já foi registrada; nenhum novo pedido foi enviado.'
// A tela manda um UUID por abertura do diálogo; só o tamanho importa, porque o id da NG sai de um hash.
const chaveValida = (chave: string) => chave.length >= 16 && chave.length <= 64

/** O que a faixa pede de fora; o teste de banco troca a NG, a configuração e a transação. */
export type DependenciasFaixa = {
  exec: Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>
  config: DependenciasInutilizacao['config']
  empresa: typeof serieEUfDaEmpresaNaNg
  enviar: typeof pedirInutilizacao
  vercelEnv: string | undefined
}

const DEPENDENCIAS: DependenciasFaixa = {
  exec: db, config: configDoAmbiente, empresa: serieEUfDaEmpresaNaNg, enviar: pedirInutilizacao, vercelEnv: process.env.VERCEL_ENV,
}

export type EntradaFaixa = { chave: string; ambiente: string; numeroInicial: string; numeroFinal: string; justificativa: string }

/**
 * Id que a NG recebe: sai do grupo e da chave de tentativa (um UUID por abertura do diálogo), então
 * a mesma tentativa repetida cai no mesmo id (duplo clique) e a chave de outra Conta nunca colide.
 */
export const idExternoDaFaixa = (grupoId: string, chave: string): string =>
  `faixa-${createHash('sha256').update(`${grupoId}:${chave.toLowerCase()}`).digest('hex').slice(0, 32)}`

/** Grava a faixa como pendente antes de chamar a NG; a mesma tentativa devolve a linha que já existe. */
async function gravarFaixa(exec: DependenciasFaixa['exec'], pedido: Omit<PedidoInutilizacao, 'inutilizacaoId'>, autorId: string) {
  const [nova] = await exec.insert(notasFiscaisSaidaInutilizacoes).values({
    grupoId: pedido.grupoId, idExterno: pedido.idExterno, ambiente: pedido.ambiente, serie: pedido.serie,
    numeroInicial: pedido.numeroInicial, numeroFinal: pedido.numeroFinal, justificativa: pedido.justificativa, pedidaPor: autorId,
  }).onConflictDoNothing().returning({ id: notasFiscaisSaidaInutilizacoes.id })
  if (nova) return { id: nova.id, repetida: false }
  const [existente] = await exec.select().from(notasFiscaisSaidaInutilizacoes).where(and(
    eq(notasFiscaisSaidaInutilizacoes.grupoId, pedido.grupoId), eq(notasFiscaisSaidaInutilizacoes.idExterno, pedido.idExterno),
  )).limit(1)
  const mesma = existente && existente.serie === pedido.serie && existente.numeroInicial === pedido.numeroInicial
    && existente.numeroFinal === pedido.numeroFinal && existente.justificativa === pedido.justificativa
  return mesma ? { id: existente.id, repetida: true } : null
}

type ConfigDaFaixa = { cfg: ConfigNotaGateway; serie: string; uf: string }

/** O que todo passo da faixa precisa do servidor: grupo visível, credencial do ambiente, série e UF da NG. */
async function dadosDaEmpresa(
  usuario: UsuarioInutilizacao, grupoId: string, ambiente: string, deps: DependenciasFaixa,
): Promise<Resultado<ConfigDaFaixa>> {
  if (!(await grupoVisivel(deps.exec, usuario, grupoId))) return { ok: false, erro: NAO_ENCONTRADO }
  // O ambiente da página tem de ser o configurado no grupo: a credencial vai ao ambiente dele.
  const lida = await lerConfigDoAmbiente(deps, grupoId, ambiente)
  if ('erro' in lida) return { ok: false, erro: lida.erro }
  const { cfg } = lida
  if (!ambienteLiberado(cfg.ambiente, deps.vercelEnv)) return { ok: false, erro: `${FORA_DA_PRODUCAO}.` }
  const empresa = await deps.empresa(cfg).catch((e: unknown) => {
    // Só as mensagens do próprio cliente (status HTTP ou campo ausente); o resto pode trazer URL com o empresaId.
    console.error(`[inutilizacao-faixa] falha ao ler a empresa na NG (${e instanceof Error && e.message.startsWith('Consultar Empresa') ? e.message : 'erro'})`)
    return null
  })
  return empresa ? { ok: true, cfg, ...empresa } : { ok: false, erro: ERRO_EMPRESA }
}

/** Série e UF para o diálogo abrir; sem pedido à NG além da leitura da empresa. */
export async function contextoDaFaixa(usuario: UsuarioInutilizacao, grupoId: string, ambiente: string, deps: DependenciasFaixa = DEPENDENCIAS) {
  const dados = await dadosDaEmpresa(usuario, grupoId, ambiente, deps)
  if (!dados.ok) return dados
  return { ok: true as const, ambiente: dados.cfg.ambiente, serie: dados.serie, uf: dados.uf, permiteInutilizar: ufPermiteInutilizacao(dados.uf) }
}

/** Conflitos que o MOVA conhece na faixa: o SQL traz os candidatos do grupo e do ambiente, a regra pura decide. */
async function conflitosNoBanco(exec: Pick<typeof db, 'select'>, grupoId: string, ambiente: ConfigNotaGateway['ambiente'], faixa: FaixaInutilizacao) {
  const [notas, pedidos] = await Promise.all([
    exec.select({
      id: notasFiscaisSaida.id, numero: notasFiscaisSaida.numero, serie: notasFiscaisSaida.serie,
      status: notasFiscaisSaida.status, motivoStatus: notasFiscaisSaida.motivoStatus,
    }).from(notasFiscaisSaida).where(and(
      eq(notasFiscaisSaida.grupoId, grupoId), eq(notasFiscaisSaida.ambiente, ambiente),
      sql`ltrim(${notasFiscaisSaida.serie}, '0') = ${semZerosAEsquerda(faixa.serie)}`,
      // CASE: o Postgres não garante a ordem do AND, e o cast quebraria com número não numérico.
      sql`CASE WHEN ${notasFiscaisSaida.numero} ~ '^[0-9]+$' THEN ${notasFiscaisSaida.numero}::numeric BETWEEN ${faixa.numeroInicial} AND ${faixa.numeroFinal} ELSE false END`,
    )),
    exec.select({
      situacao: notasFiscaisSaidaInutilizacoes.situacao, motivoStatus: notasFiscaisSaidaInutilizacoes.motivoStatus, serie: notasFiscaisSaidaInutilizacoes.serie,
      numeroInicial: notasFiscaisSaidaInutilizacoes.numeroInicial, numeroFinal: notasFiscaisSaidaInutilizacoes.numeroFinal, criadoEm: notasFiscaisSaidaInutilizacoes.criadoEm,
    }).from(notasFiscaisSaidaInutilizacoes).where(and(
      eq(notasFiscaisSaidaInutilizacoes.grupoId, grupoId), eq(notasFiscaisSaidaInutilizacoes.ambiente, ambiente),
      sql`ltrim(${notasFiscaisSaidaInutilizacoes.serie}, '0') = ${semZerosAEsquerda(faixa.serie)}`,
      lte(notasFiscaisSaidaInutilizacoes.numeroInicial, faixa.numeroFinal), gte(notasFiscaisSaidaInutilizacoes.numeroFinal, faixa.numeroInicial),
    )),
  ])
  return conflitosDaFaixa(faixa, notas, pedidos)
}

/** Valida a faixa e avisa dos conflitos locais, sem gravar nem enviar; o pedido repete a validação. */
export async function conferirFaixa(
  usuario: UsuarioInutilizacao, grupoId: string, entrada: Omit<EntradaFaixa, 'chave'>, deps: DependenciasFaixa = DEPENDENCIAS,
) {
  const dados = await dadosDaEmpresa(usuario, grupoId, entrada.ambiente, deps)
  if (!dados.ok) return dados
  if (!ufPermiteInutilizacao(dados.uf)) return { ok: false as const, erro: ERRO_UF }
  const validacao = validarFaixaInutilizacao({ ...entrada, serie: dados.serie })
  if (!validacao.ok) return validacao
  return { ok: true as const, serie: dados.serie, conflitos: await conflitosNoBanco(deps.exec, grupoId, dados.cfg.ambiente, validacao.faixa) }
}

/** Faixas pedidas neste grupo e ambiente (as do pedido por nota ficam na linha da nota), com a Conta no where. */
export function listarFaixas(
  exec: Pick<typeof db, 'select'>, escopo: { grupoId: string; contaId: string | null; ambiente: 'Producao' | 'Homologacao' },
) {
  const t = notasFiscaisSaidaInutilizacoes
  return exec.select({
    id: t.id, serie: t.serie, numeroInicial: t.numeroInicial, numeroFinal: t.numeroFinal, justificativa: t.justificativa,
    situacao: t.situacao, motivoStatus: t.motivoStatus, protocolo: t.protocolo, criadoEm: t.criadoEm,
  }).from(t).innerJoin(grupos, eq(grupos.id, t.grupoId)).where(and(
    eq(t.grupoId, escopo.grupoId), eq(t.ambiente, escopo.ambiente), isNull(t.notaId),
    escopo.contaId === null ? undefined : eq(grupos.contaId, escopo.contaId),
  )).orderBy(desc(t.criadoEm)).limit(FAIXAS_NO_HISTORICO)
}

/**
 * Pede a inutilização de uma faixa contínua (#655), sem nota de origem. Grupo, Conta, ambiente, série e UF
 * saem do servidor e da Nota Gateway; da tela só vêm a faixa, a justificativa e a chave da tentativa.
 * Faixa repetida ou sobreposta com outra chave não bloqueia: o aviso é da tela.
 */
export async function inutilizarFaixa(
  usuario: UsuarioInutilizacao, grupoId: string, entrada: EntradaFaixa, deps: DependenciasFaixa = DEPENDENCIAS,
): Promise<Resultado<{ inutilizacaoId: string; aviso: string | null }>> {
  if (!chaveValida(entrada.chave)) return { ok: false, erro: ERRO_TENTATIVA }
  const dados = await dadosDaEmpresa(usuario, grupoId, entrada.ambiente, deps)
  if (!dados.ok) return dados
  if (!ufPermiteInutilizacao(dados.uf)) return { ok: false, erro: ERRO_UF }
  const validacao = validarFaixaInutilizacao({ ...entrada, serie: dados.serie })
  if (!validacao.ok) return validacao

  const pedido = { grupoId, idExterno: idExternoDaFaixa(grupoId, entrada.chave), ambiente: dados.cfg.ambiente, ...validacao.faixa }
  const gravada = await gravarFaixa(deps.exec, pedido, usuario.id)
  if (!gravada) return { ok: false, erro: ERRO_CHAVE_REUSADA }
  if (gravada.repetida) return { ok: true, inutilizacaoId: gravada.id, aviso: AVISO_REPETIDA }
  return enviarPedido(deps, usuario, { ...pedido, inutilizacaoId: gravada.id }, dados.cfg)
}

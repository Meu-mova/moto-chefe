import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { notasFiscaisSaidaInutilizacoes } from '@/lib/db/schema'
import { ambienteLiberado, FORA_DA_PRODUCAO } from './ambiente'
import { configNotaGateway, pedirInutilizacao, serieEUfDaEmpresaNaNg, type ConfigNotaGateway } from './client'
import { ERRO_SEM_CONFIGURACAO, ufPermiteInutilizacao, validarFaixaInutilizacao } from './inutilizacao'
import { enviarPedido, grupoVisivel, type PedidoInutilizacao, type Resultado, type UsuarioInutilizacao } from './inutilizar'

// Mesma frase para grupo de outra Conta, grupo inexistente e papel sem permissão: não revela que o grupo existe.
const NAO_ENCONTRADO = 'Grupo não encontrado'
const ERRO_AMBIENTE = 'O ambiente da página mudou. Atualize a página e confira a configuração da Nota Gateway.'
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
  config: (grupoId: string, exec: DependenciasFaixa['exec']) => Promise<ConfigNotaGateway | null>
  empresa: typeof serieEUfDaEmpresaNaNg
  enviar: typeof pedirInutilizacao
  vercelEnv: string | undefined
}

const DEPENDENCIAS: DependenciasFaixa = {
  exec: db, config: configNotaGateway, empresa: serieEUfDaEmpresaNaNg, enviar: pedirInutilizacao, vercelEnv: process.env.VERCEL_ENV,
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

/**
 * Pede a inutilização de uma faixa contínua (#655), sem nota de origem. Grupo, Conta, ambiente, série e UF
 * saem do servidor e da Nota Gateway; da tela só vêm a faixa, a justificativa e a chave da tentativa.
 * Faixa repetida ou sobreposta com outra chave não bloqueia: o aviso é da tela.
 */
export async function inutilizarFaixa(
  usuario: UsuarioInutilizacao, grupoId: string, entrada: EntradaFaixa, deps: DependenciasFaixa = DEPENDENCIAS,
): Promise<Resultado<{ inutilizacaoId: string; aviso: string | null }>> {
  const { exec } = deps
  if (!(await grupoVisivel(exec, usuario, grupoId))) return { ok: false, erro: NAO_ENCONTRADO }
  if (!chaveValida(entrada.chave)) return { ok: false, erro: ERRO_TENTATIVA }

  const cfg = await deps.config(grupoId, exec)
  if (!cfg) return { ok: false, erro: ERRO_SEM_CONFIGURACAO }
  if (cfg.ambiente !== entrada.ambiente) return { ok: false, erro: ERRO_AMBIENTE }
  if (!ambienteLiberado(cfg.ambiente, deps.vercelEnv)) return { ok: false, erro: `${FORA_DA_PRODUCAO}.` }
  const empresa = await deps.empresa(cfg).catch(() => null)
  if (!empresa) return { ok: false, erro: ERRO_EMPRESA }
  if (!ufPermiteInutilizacao(empresa.uf)) return { ok: false, erro: ERRO_UF }
  const validacao = validarFaixaInutilizacao({ ...entrada, serie: empresa.serie })
  if (!validacao.ok) return validacao

  const dados = { grupoId, idExterno: idExternoDaFaixa(grupoId, entrada.chave), ambiente: cfg.ambiente, ...validacao.faixa }
  const gravada = await gravarFaixa(exec, dados, usuario.id)
  if (!gravada) return { ok: false, erro: ERRO_CHAVE_REUSADA }
  if (gravada.repetida) return { ok: true, inutilizacaoId: gravada.id, aviso: AVISO_REPETIDA }
  return enviarPedido(deps, usuario, { ...dados, inutilizacaoId: gravada.id }, cfg)
}

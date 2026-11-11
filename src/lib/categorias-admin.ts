/**
 * Cadastro de categorias de despesa e de caixa do grupo (#834). O grupo vem sempre do servidor
 * (grupo ativo do sócio) e vai no where de toda gravação: a categoria de outra Conta e a inexistente
 * recebem a mesma frase. Molde: src/lib/maquininhas-admin.ts.
 */
import { and, count, eq, ne, sql, type AnyColumn } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { categoriasCaixa, categoriasDespesa, despesas, despesasOpenFinance, lancamentosCaixa, lojas } from '@/lib/db/schema'
import { RecusaUsuario } from '@/lib/resultado-action'
import { normalizarClassificacao } from '@/lib/categoria-despesa'
import { CATEGORIA_NAO_ENCONTRADA } from '@/lib/categorias-do-grupo'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

export type DadosCategoriaCaixa = { nome: string; tipo: string }
export type DadosCategoriaDespesa = {
  nome: string
  contaComoDespesa: boolean
  motivoNaoOperacional?: string | null
  grupoDre?: string | null
}

const TIPOS_CAIXA = ['entrada', 'saida', 'ambos']
const COM_LANCAMENTOS = 'Esta categoria já tem lançamentos. Desative em vez de excluir.'

function nomeLimpo(nome: string): string {
  const limpo = nome.trim()
  if (!limpo) throw new RecusaUsuario('Nome obrigatório')
  return limpo
}

// Mesma comparação do índice único (e do DRE): "Aluguel" e " aluguel" são o mesmo nome.
const mesmoNome = (coluna: AnyColumn, nome: string) => sql`lower(trim(${coluna})) = lower(trim(${nome}))`

function recusarSeHouver(linhas: unknown[], frase: string) {
  if (linhas.length > 0) throw new RecusaUsuario(frase)
}

function exigirEncontrada<T>(linhas: T[]): T {
  if (linhas.length === 0) throw new RecusaUsuario(CATEGORIA_NAO_ENCONTRADA)
  return linhas[0]
}

// ─── Despesa ─────────────────────────────────────────────────────────────────

const daDespesaNoGrupo = (grupoId: string, id: string) =>
  and(eq(categoriasDespesa.id, id), eq(categoriasDespesa.grupoId, grupoId))

async function recusarNomeRepetidoDespesa(exec: Executor, grupoId: string, nome: string, idAtual?: string) {
  recusarSeHouver(await exec.select({ id: categoriasDespesa.id }).from(categoriasDespesa).where(and(
    eq(categoriasDespesa.grupoId, grupoId), mesmoNome(categoriasDespesa.nome, nome),
    ...(idAtual ? [ne(categoriasDespesa.id, idAtual)] : []),
  )).limit(1), 'Já existe uma categoria com esse nome')
}

export async function criarCategoriaDespesa(exec: Executor, grupoId: string, dados: DadosCategoriaDespesa): Promise<void> {
  const nome = nomeLimpo(dados.nome)
  const classificacao = normalizarClassificacao(dados)
  await recusarNomeRepetidoDespesa(exec, grupoId, nome)
  await exec.insert(categoriasDespesa).values({ grupoId, nome, ...classificacao })
}

export async function editarCategoriaDespesa(
  exec: Executor, grupoId: string, id: string, dados: DadosCategoriaDespesa,
): Promise<void> {
  const nome = nomeLimpo(dados.nome)
  const classificacao = normalizarClassificacao(dados)
  await recusarNomeRepetidoDespesa(exec, grupoId, nome, id)
  exigirEncontrada(await exec.update(categoriasDespesa).set({ nome, ...classificacao })
    .where(daDespesaNoGrupo(grupoId, id)).returning({ id: categoriasDespesa.id }))
}

export async function definirCategoriaDespesaAtiva(exec: Executor, grupoId: string, id: string, ativo: boolean): Promise<void> {
  exigirEncontrada(await exec.update(categoriasDespesa).set({ ativo })
    .where(daDespesaNoGrupo(grupoId, id)).returning({ id: categoriasDespesa.id }))
}

/** A despesa guarda a categoria pelo nome: apagar a usada deixaria o histórico com um nome que o DRE não conhece. */
export async function excluirCategoriaDespesa(exec: Executor, grupoId: string, id: string): Promise<void> {
  const cat = exigirEncontrada(await exec.select({ nome: categoriasDespesa.nome }).from(categoriasDespesa)
    .where(daDespesaNoGrupo(grupoId, id)).limit(1))
  const [manual, banco] = await Promise.all([
    exec.select({ id: despesas.id }).from(despesas)
      .where(and(eq(despesas.grupoId, grupoId), mesmoNome(despesas.categoria, cat.nome))).limit(1),
    exec.select({ id: despesasOpenFinance.id }).from(despesasOpenFinance)
      .where(and(eq(despesasOpenFinance.grupoId, grupoId), mesmoNome(despesasOpenFinance.categoria, cat.nome))).limit(1),
  ])
  recusarSeHouver([...manual, ...banco], COM_LANCAMENTOS)
  await exec.delete(categoriasDespesa).where(daDespesaNoGrupo(grupoId, id))
}

/**
 * Quantas despesas manuais do grupo usam a categoria. Conta só `despesas`: o extrato do Open
 * Finance guarda a categoria como texto, então o total real é maior. Serve de ordem de grandeza.
 */
export async function contarLancamentosDaCategoriaDespesa(exec: Executor, grupoId: string, nome: string): Promise<number> {
  const [linha] = await exec.select({ qtd: count() }).from(despesas)
    .where(and(eq(despesas.grupoId, grupoId), eq(despesas.categoria, nome)))
  return Number(linha?.qtd ?? 0)
}

// ─── Caixa ───────────────────────────────────────────────────────────────────

const daCaixaNoGrupo = (grupoId: string, id: string) =>
  and(eq(categoriasCaixa.id, id), eq(categoriasCaixa.grupoId, grupoId))

function dadosCaixa(dados: DadosCategoriaCaixa) {
  const nome = nomeLimpo(dados.nome)
  if (!TIPOS_CAIXA.includes(dados.tipo)) throw new RecusaUsuario('Tipo inválido')
  return { nome, tipo: dados.tipo }
}

// O mesmo nome vale como entrada e como saída: a repetição é por tipo.
async function recusarNomeRepetidoCaixa(exec: Executor, grupoId: string, nome: string, tipo: string, idAtual?: string) {
  recusarSeHouver(await exec.select({ id: categoriasCaixa.id }).from(categoriasCaixa).where(and(
    eq(categoriasCaixa.grupoId, grupoId), eq(categoriasCaixa.tipo, tipo), mesmoNome(categoriasCaixa.nome, nome),
    ...(idAtual ? [ne(categoriasCaixa.id, idAtual)] : []),
  )).limit(1), 'Já existe uma categoria com esse nome')
}

export async function criarCategoriaCaixa(exec: Executor, grupoId: string, dados: DadosCategoriaCaixa): Promise<void> {
  const valores = dadosCaixa(dados)
  await recusarNomeRepetidoCaixa(exec, grupoId, valores.nome, valores.tipo)
  await exec.insert(categoriasCaixa).values({ grupoId, ...valores })
}

export async function editarCategoriaCaixa(exec: Executor, grupoId: string, id: string, dados: DadosCategoriaCaixa): Promise<void> {
  const valores = dadosCaixa(dados)
  await recusarNomeRepetidoCaixa(exec, grupoId, valores.nome, valores.tipo, id)
  exigirEncontrada(await exec.update(categoriasCaixa).set(valores)
    .where(daCaixaNoGrupo(grupoId, id)).returning({ id: categoriasCaixa.id }))
}

export async function definirCategoriaCaixaAtiva(exec: Executor, grupoId: string, id: string, ativo: boolean): Promise<void> {
  exigirEncontrada(await exec.update(categoriasCaixa).set({ ativo })
    .where(daCaixaNoGrupo(grupoId, id)).returning({ id: categoriasCaixa.id }))
}

export async function definirContaComoDespesaCaixa(
  exec: Executor, grupoId: string, id: string, contaComoDespesa: boolean,
): Promise<void> {
  exigirEncontrada(await exec.update(categoriasCaixa).set({ contaComoDespesa })
    .where(daCaixaNoGrupo(grupoId, id)).returning({ id: categoriasCaixa.id }))
}

/**
 * lancamentos_caixa não tem grupo_id: o grupo vem da loja do lançamento. Só conta o lançamento
 * do tipo da categoria ("ambos" vale para os dois): a "Ajuste" de entrada não é usada pela saída.
 */
export async function excluirCategoriaCaixa(exec: Executor, grupoId: string, id: string): Promise<void> {
  const cat = exigirEncontrada(await exec.select({ nome: categoriasCaixa.nome, tipo: categoriasCaixa.tipo })
    .from(categoriasCaixa).where(daCaixaNoGrupo(grupoId, id)).limit(1))
  recusarSeHouver(await exec.select({ id: lancamentosCaixa.id }).from(lancamentosCaixa)
    .innerJoin(lojas, eq(lancamentosCaixa.lojaId, lojas.id))
    .where(and(
      eq(lojas.grupoId, grupoId),
      mesmoNome(lancamentosCaixa.categoria, cat.nome),
      ...(cat.tipo === 'ambos' ? [] : [sql`${lancamentosCaixa.tipo}::text = ${cat.tipo}`]),
    ))
    .limit(1), COM_LANCAMENTOS)
  await exec.delete(categoriasCaixa).where(daCaixaNoGrupo(grupoId, id))
}

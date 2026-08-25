'use server'
import { db } from '@/lib/db'
import { categoriasCaixa, categoriasDespesa, despesas } from '@/lib/db/schema'
import { eq, asc, count } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { normalizarClassificacao } from '@/lib/categoria-despesa'

async function requireAdmin() {
  const u = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(u.papel)) throw new Error('Sem permissão')
}

export async function listarCategoriasCaixaAction() {
  return db
    .select()
    .from(categoriasCaixa)
    .orderBy(categoriasCaixa.tipo, asc(categoriasCaixa.ordem), asc(categoriasCaixa.nome))
}

export async function criarCategoriaAction(dados: { nome: string; tipo: string }) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!['entrada', 'saida', 'ambos'].includes(dados.tipo)) throw new Error('Tipo inválido')

  await db.insert(categoriasCaixa).values({
    nome: dados.nome.trim(),
    tipo: dados.tipo,
  })
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
}

export async function editarCategoriaAction(id: string, dados: { nome: string; tipo: string }) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!['entrada', 'saida', 'ambos'].includes(dados.tipo)) throw new Error('Tipo inválido')

  await db
    .update(categoriasCaixa)
    .set({ nome: dados.nome.trim(), tipo: dados.tipo })
    .where(eq(categoriasCaixa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
}

export async function excluirCategoriaAction(id: string) {
  await requireAdmin()
  await db.delete(categoriasCaixa).where(eq(categoriasCaixa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  await requireAdmin()
  await db
    .update(categoriasCaixa)
    .set({ ativo })
    .where(eq(categoriasCaixa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
}

/**
 * /financeiro entra aqui porque é ele quem LÊ conta_como_despesa: sem este
 * revalidate, mudar a classificação de uma categoria não mexia no resultado até
 * o cache expirar, e o número velho parecia que a mudança não tinha pegado.
 */
function revalidarDespesa() {
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

export async function listarCategoriasDespesaAction() {
  return db
    .select()
    .from(categoriasDespesa)
    .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome))
}

export type DadosCategoriaDespesa = {
  nome: string
  contaComoDespesa: boolean
  motivoNaoOperacional?: string | null
}

export async function criarCategoriaDespesaAction(dados: DadosCategoriaDespesa) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  const classificacao = normalizarClassificacao(dados)

  await db.insert(categoriasDespesa).values({
    nome: dados.nome.trim(),
    ...classificacao,
  })
  revalidarDespesa()
}

export async function editarCategoriaDespesaAction(id: string, dados: DadosCategoriaDespesa) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  const classificacao = normalizarClassificacao(dados)

  await db
    .update(categoriasDespesa)
    .set({ nome: dados.nome.trim(), ...classificacao })
    .where(eq(categoriasDespesa.id, id))
  revalidarDespesa()
}

export async function excluirCategoriaDespesaAction(id: string) {
  await requireAdmin()
  await db.delete(categoriasDespesa).where(eq(categoriasDespesa.id, id))
  revalidarDespesa()
}

export async function toggleAtivoDespesaAction(id: string, ativo: boolean) {
  await requireAdmin()
  await db
    .update(categoriasDespesa)
    .set({ ativo })
    .where(eq(categoriasDespesa.id, id))
  revalidarDespesa()
}

/**
 * Categoria de caixa fora do cálculo de despesa — "Depósito" leva a gaveta pro
 * banco, não é gasto. Aqui não há motivo a escolher: o caminho do caixa tem um
 * só ('caixa_nao_despesa'), então é liga-desliga.
 */
export async function toggleContaComoDespesaCaixaAction(id: string, contaComoDespesa: boolean) {
  await requireAdmin()
  await db
    .update(categoriasCaixa)
    .set({ contaComoDespesa })
    .where(eq(categoriasCaixa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
  revalidatePath('/financeiro')
}

/**
 * Quantos lançamentos manuais já usam a categoria. A tela mostra isso antes de
 * trocar a classificação: a regra vale para o histórico inteiro, então mexer aqui
 * reescreve meses fechados — esse número é o tamanho do estrago (ou do conserto).
 *
 * Conta só `despesas`; o extrato do Open Finance guarda a categoria como texto e
 * não tem vínculo por id, então o total real é maior. Serve de ordem de grandeza.
 */
export async function contarLancamentosDaCategoriaAction(nome: string) {
  await requireAdmin()
  const [linha] = await db
    .select({ qtd: count() })
    .from(despesas)
    .where(eq(despesas.categoria, nome))
  return Number(linha?.qtd ?? 0)
}

'use server'
import { db } from '@/lib/db'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
import { acao, RecusaUsuario } from '@/lib/resultado-action'
import {
  criarCategoriaCaixa, editarCategoriaCaixa, excluirCategoriaCaixa, definirCategoriaCaixaAtiva,
  definirContaComoDespesaCaixa, criarCategoriaDespesa, editarCategoriaDespesa, excluirCategoriaDespesa,
  definirCategoriaDespesaAtiva, contarLancamentosDaCategoriaDespesa,
  type DadosCategoriaCaixa, type DadosCategoriaDespesa,
} from '@/lib/categorias-admin'

// O grupo é sempre o ativo do sócio, nunca um id vindo da tela (#834).
async function grupoDoAdmin() {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) throw new RecusaUsuario('Sem permissão')
  return (await getGrupoAtivo(usuario)).id
}

function revalidarCaixa() {
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
  revalidatePath('/financeiro')
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
  revalidatePath('/admin/dre')
}

export async function criarCategoriaAction(dados: DadosCategoriaCaixa) {
  return acao(async () => {
    await criarCategoriaCaixa(db, await grupoDoAdmin(), dados)
    revalidarCaixa()
  })
}

export async function editarCategoriaAction(id: string, dados: DadosCategoriaCaixa) {
  return acao(async () => {
    await editarCategoriaCaixa(db, await grupoDoAdmin(), id, dados)
    revalidarCaixa()
  })
}

export async function excluirCategoriaAction(id: string) {
  return acao(async () => {
    await excluirCategoriaCaixa(db, await grupoDoAdmin(), id)
    revalidarCaixa()
  })
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  return acao(async () => {
    await definirCategoriaCaixaAtiva(db, await grupoDoAdmin(), id, ativo)
    revalidarCaixa()
  })
}

/**
 * Categoria de caixa fora do cálculo de despesa — "Depósito" leva a gaveta pro
 * banco, não é gasto. Aqui não há motivo a escolher: o caminho do caixa tem um
 * só ('caixa_nao_despesa'), então é liga-desliga.
 */
export async function toggleContaComoDespesaCaixaAction(id: string, contaComoDespesa: boolean) {
  return acao(async () => {
    await definirContaComoDespesaCaixa(db, await grupoDoAdmin(), id, contaComoDespesa)
    revalidarCaixa()
  })
}

export async function criarCategoriaDespesaAction(dados: DadosCategoriaDespesa) {
  return acao(async () => {
    await criarCategoriaDespesa(db, await grupoDoAdmin(), dados)
    revalidarDespesa()
  })
}

export async function editarCategoriaDespesaAction(id: string, dados: DadosCategoriaDespesa) {
  return acao(async () => {
    await editarCategoriaDespesa(db, await grupoDoAdmin(), id, dados)
    revalidarDespesa()
  })
}

export async function excluirCategoriaDespesaAction(id: string) {
  return acao(async () => {
    await excluirCategoriaDespesa(db, await grupoDoAdmin(), id)
    revalidarDespesa()
  })
}

export async function toggleAtivoDespesaAction(id: string, ativo: boolean) {
  return acao(async () => {
    await definirCategoriaDespesaAtiva(db, await grupoDoAdmin(), id, ativo)
    revalidarDespesa()
  })
}

/**
 * Quantos lançamentos manuais do grupo já usam a categoria. A tela mostra isso antes de
 * trocar a classificação: a regra vale para o histórico inteiro, então mexer aqui
 * reescreve meses fechados — esse número é o tamanho do estrago (ou do conserto).
 */
export async function contarLancamentosDaCategoriaAction(nome: string) {
  return contarLancamentosDaCategoriaDespesa(db, await grupoDoAdmin(), nome)
}

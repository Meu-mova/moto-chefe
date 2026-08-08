'use server'
import { db } from '@/lib/db'
import { origensVenda } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
import { TIPOS_ORIGEM } from '@/lib/origem-venda'

// aux_adm entra junto: é quem opera a loja e cadastra a origem de uma ação local.
const PAPEIS = ['admin_geral', 'admin_socio', 'aux_adm']

async function exigirGestor() {
  const u = await getUsuarioLogado()
  if (!PAPEIS.includes(u.papel)) throw new Error('Sem permissão')
  return u
}

function revalidar() {
  revalidatePath('/admin/origens')
  revalidatePath('/estoque')
  revalidatePath('/vendas')
  revalidatePath('/marketing')
}

type DadosOrigem = {
  nome: string
  tipo: string
  pedeDetalhe: boolean
  ordem: number
}

function validarDados(dados: DadosOrigem) {
  if (!dados.nome.trim()) throw new Error('Informe o nome da origem')
  if (!TIPOS_ORIGEM.includes(dados.tipo as (typeof TIPOS_ORIGEM)[number])) {
    throw new Error('Tipo inválido')
  }
}

export async function criarOrigemAction(dados: DadosOrigem) {
  const usuario = await exigirGestor()
  validarDados(dados)
  const grupo = await getGrupoAtivo(usuario)

  await db.insert(origensVenda).values({
    grupoId: grupo.id,
    nome: dados.nome.trim(),
    tipo: dados.tipo,
    pedeDetalhe: dados.pedeDetalhe,
    ordem: dados.ordem,
  })
  revalidar()
}

export async function editarOrigemAction(id: string, dados: DadosOrigem) {
  const usuario = await exigirGestor()
  validarDados(dados)
  const grupo = await getGrupoAtivo(usuario)

  // O and() com grupo_id não é enfeite: sem ele, um id de outra bandeira passado
  // à mão editaria o catálogo dela.
  await db
    .update(origensVenda)
    .set({
      nome: dados.nome.trim(),
      tipo: dados.tipo,
      pedeDetalhe: dados.pedeDetalhe,
      ordem: dados.ordem,
    })
    .where(and(eq(origensVenda.id, id), eq(origensVenda.grupoId, grupo.id)))
  revalidar()
}

/**
 * Ativa/desativa. Não existe excluir: `vendas.origem_id` referencia a linha, e
 * apagar apagaria o histórico do relatório.
 */
export async function alternarOrigemAtivaAction(id: string, ativo: boolean) {
  const usuario = await exigirGestor()
  const grupo = await getGrupoAtivo(usuario)

  await db
    .update(origensVenda)
    .set({ ativo })
    .where(and(eq(origensVenda.id, id), eq(origensVenda.grupoId, grupo.id)))
  revalidar()
}

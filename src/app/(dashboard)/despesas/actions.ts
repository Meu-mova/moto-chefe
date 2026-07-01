'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { despesas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio'] as const

type DespesaInput = {
  lojaId: string | null
  categoria: string
  descricao?: string
  valor: string
  data: string
  formaPagamento: string
  banco: string
}

function assertAdmin(papel: string) {
  if (!ADMINS.includes(papel as typeof ADMINS[number])) {
    throw new Error('Sem permissão')
  }
}

function parseValor(v: string) {
  const n = parseFloat(v)
  if (isNaN(n) || n <= 0) throw new Error('Valor inválido')
  return v
}

async function lojaIdValidaNoGrupo(usuario: { papel: string; lojaId: string | null }, lojaId: string | null) {
  if (!lojaId) return null
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  return lojaIdsGrupo.includes(lojaId) ? lojaId : null
}

export async function criarDespesaAction(dados: DespesaInput) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  parseValor(dados.valor)
  const grupo = await getGrupoAtivo(usuario)
  const lojaId = await lojaIdValidaNoGrupo(usuario, dados.lojaId)

  await db.insert(despesas).values({
    grupoId:        grupo.id,
    lojaId,
    usuarioId:      usuario.id,
    categoria:      dados.categoria,
    descricao:      dados.descricao?.trim() || null,
    valor:          dados.valor,
    data:           dados.data,
    formaPagamento: dados.formaPagamento,
    banco:          dados.banco,
  })

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

export async function editarDespesaAction(id: string, dados: DespesaInput) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  parseValor(dados.valor)
  const grupo = await getGrupoAtivo(usuario)
  const lojaId = await lojaIdValidaNoGrupo(usuario, dados.lojaId)

  const res = await db.update(despesas).set({
    lojaId,
    categoria:      dados.categoria,
    descricao:      dados.descricao?.trim() || null,
    valor:          dados.valor,
    data:           dados.data,
    formaPagamento: dados.formaPagamento,
    banco:          dados.banco,
  }).where(and(eq(despesas.id, id), eq(despesas.grupoId, grupo.id)))
    .returning({ id: despesas.id })

  if (!res.length) throw new Error('Despesa não encontrada')

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

export async function excluirDespesaAction(id: string) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  const grupo = await getGrupoAtivo(usuario)

  const res = await db.delete(despesas)
    .where(and(eq(despesas.id, id), eq(despesas.grupoId, grupo.id)))
    .returning({ id: despesas.id })

  if (!res.length) throw new Error('Despesa não encontrada')

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

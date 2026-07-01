'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { despesas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
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

export async function criarDespesaAction(dados: DespesaInput) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  parseValor(dados.valor)

  await db.insert(despesas).values({
    grupoId:        '00000000-0000-4000-8000-000000000001', // Sul de Minas
    lojaId:         dados.lojaId || null,
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

  await db.update(despesas).set({
    lojaId:         dados.lojaId || null,
    categoria:      dados.categoria,
    descricao:      dados.descricao?.trim() || null,
    valor:          dados.valor,
    data:           dados.data,
    formaPagamento: dados.formaPagamento,
    banco:          dados.banco,
  }).where(eq(despesas.id, id))

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

export async function excluirDespesaAction(id: string) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)

  await db.delete(despesas).where(eq(despesas.id, id))

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

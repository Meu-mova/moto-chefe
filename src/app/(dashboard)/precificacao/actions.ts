'use server'
import { db } from '@/lib/db'
import { precificacao } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']

async function checarAdmin() {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')
}

export type PrecificacaoPayload = {
  nome: string
  valorMinimo: string
  taxaPix: string
  taxasCartao: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

export async function criarPrecificacaoAction(data: PrecificacaoPayload) {
  await checarAdmin()
  await db.insert(precificacao).values({
    nome: data.nome.toUpperCase(),
    valorMinimo: data.valorMinimo,
    taxaPix: data.taxaPix,
    taxasCartao: data.taxasCartao,
    taxasLink: data.taxasLink,
    taxasFinanciamento: data.taxasFinanciamento,
  })
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function editarPrecificacaoAction(id: string, data: PrecificacaoPayload) {
  await checarAdmin()
  await db.update(precificacao).set({
    nome: data.nome.toUpperCase(),
    valorMinimo: data.valorMinimo,
    taxaPix: data.taxaPix,
    taxasCartao: data.taxasCartao,
    taxasLink: data.taxasLink,
    taxasFinanciamento: data.taxasFinanciamento,
  }).where(eq(precificacao.id, id))
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  await checarAdmin()
  await db.update(precificacao).set({ ativo }).where(eq(precificacao.id, id))
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function excluirPrecificacaoAction(id: string) {
  await checarAdmin()
  await db.delete(precificacao).where(eq(precificacao.id, id))
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

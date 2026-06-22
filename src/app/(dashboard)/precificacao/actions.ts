'use server'
import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']

async function checarAdmin() {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')
}

export type TaxasPayload = {
  taxasCartao: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

export async function salvarTaxasAction(data: TaxasPayload) {
  await checarAdmin()
  await db
    .insert(configuracaoTaxas)
    .values({ id: 1, ...data })
    .onConflictDoUpdate({
      target: configuracaoTaxas.id,
      set: {
        taxasCartao: data.taxasCartao,
        taxasLink: data.taxasLink,
        taxasFinanciamento: data.taxasFinanciamento,
        atualizadoEm: sql`NOW()`,
      },
    })
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function criarModeloAction(data: { nome: string; valorMinimo: string }) {
  await checarAdmin()
  await db.insert(precificacao).values({
    nome: data.nome.toUpperCase(),
    valorMinimo: data.valorMinimo,
    taxaPix: '0',
    taxasCartao: {},
    taxasLink: {},
    taxasFinanciamento: {},
  })
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function editarModeloAction(id: string, data: { nome: string; valorMinimo: string }) {
  await checarAdmin()
  await db.update(precificacao).set({
    nome: data.nome.toUpperCase(),
    valorMinimo: data.valorMinimo,
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

export async function excluirModeloAction(id: string) {
  await checarAdmin()
  await db.delete(precificacao).where(eq(precificacao.id, id))
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

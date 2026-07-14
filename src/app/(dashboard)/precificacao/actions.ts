'use server'
import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { eq, and, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']

async function checarAdmin() {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')
  return getGrupoAtivo(u)
}

export type TaxasPayload = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
  freteValorKm: string
  freteKmGratis: number
  imposto: string
}

export async function salvarTaxasAction(data: TaxasPayload) {
  const grupo = await checarAdmin()
  await db
    .insert(configuracaoTaxas)
    .values({ grupoId: grupo.id, ...data })
    .onConflictDoUpdate({
      target: configuracaoTaxas.grupoId,
      set: {
        taxasCartao: data.taxasCartao,
        taxasDebito: data.taxasDebito,
        taxasLink: data.taxasLink,
        taxasFinanciamento: data.taxasFinanciamento,
        freteValorKm: data.freteValorKm,
        freteKmGratis: data.freteKmGratis,
        imposto: data.imposto,
        atualizadoEm: sql`NOW()`,
      },
    })
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
  revalidatePath('/financeiro')
}

export async function criarModeloAction(data: { nome: string; valorMinimo: string; custo?: string }) {
  const grupo = await checarAdmin()
  await db.insert(precificacao).values({
    grupoId: grupo.id,
    nome: data.nome.toUpperCase(),
    valorMinimo: data.valorMinimo,
    custo: data.custo || null,
    taxaPix: '0',
    taxasCartao: {},
    taxasLink: {},
    taxasFinanciamento: {},
  })
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function editarModeloAction(id: string, data: { nome: string; valorMinimo: string; custo?: string }) {
  const grupo = await checarAdmin()
  await db.update(precificacao).set({
    nome: data.nome.toUpperCase(),
    valorMinimo: data.valorMinimo,
    custo: data.custo || null,
  }).where(and(eq(precificacao.id, id), eq(precificacao.grupoId, grupo.id)))
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  const grupo = await checarAdmin()
  await db.update(precificacao).set({ ativo }).where(and(eq(precificacao.id, id), eq(precificacao.grupoId, grupo.id)))
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function excluirModeloAction(id: string) {
  const grupo = await checarAdmin()
  await db.delete(precificacao).where(and(eq(precificacao.id, id), eq(precificacao.grupoId, grupo.id)))
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

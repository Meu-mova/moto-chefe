'use server'
import { db } from '@/lib/db'
import { simuladorPrecos } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']

export async function criarSimuladorAction(data: {
  nome: string
  precoAvista: string
  precoPix: string
  taxaCartaoFisico: string
  taxaLinkPagamento: string
}) {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')

  await db.insert(simuladorPrecos).values({
    nome: data.nome.toUpperCase(),
    precoAvista: data.precoAvista,
    precoPix: data.precoPix,
    taxaCartaoFisico: data.taxaCartaoFisico,
    taxaLinkPagamento: data.taxaLinkPagamento,
  })

  revalidatePath('/simulador')
}

export async function editarSimuladorAction(id: string, data: {
  nome: string
  precoAvista: string
  precoPix: string
  taxaCartaoFisico: string
  taxaLinkPagamento: string
}) {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')

  await db.update(simuladorPrecos).set({
    nome: data.nome.toUpperCase(),
    precoAvista: data.precoAvista,
    precoPix: data.precoPix,
    taxaCartaoFisico: data.taxaCartaoFisico,
    taxaLinkPagamento: data.taxaLinkPagamento,
  }).where(eq(simuladorPrecos.id, id))

  revalidatePath('/simulador')
}

export async function excluirSimuladorAction(id: string) {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')

  await db.delete(simuladorPrecos).where(eq(simuladorPrecos.id, id))
  revalidatePath('/simulador')
}

'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { pecasCatalogo } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm'] as const

async function verificarAcesso() {
  const usuario = await getUsuarioLogado()
  if (!(GESTORES as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  return usuario
}

export type PecaInput = {
  nome: string
  valor: number
}

export async function listarPecasAction(params?: { apenasAtivos?: boolean }) {
  await verificarAcesso()
  const todas = await db.select().from(pecasCatalogo).orderBy(asc(pecasCatalogo.nome))
  return params?.apenasAtivos ? todas.filter(p => p.ativo) : todas
}

export async function criarPecaAction(input: PecaInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  const [nova] = await db.insert(pecasCatalogo).values({
    nome,
    valor: String(input.valor),
  }).returning({ id: pecasCatalogo.id })

  revalidatePath('/pecas')
  return nova
}

export async function atualizarPecaAction(id: string, input: PecaInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  await db.update(pecasCatalogo).set({
    nome,
    valor: String(input.valor),
    atualizadoEm: new Date(),
  }).where(eq(pecasCatalogo.id, id))

  revalidatePath('/pecas')
}

export async function inativarPecaAction(id: string) {
  await verificarAcesso()
  await db.update(pecasCatalogo)
    .set({ ativo: false, atualizadoEm: new Date() })
    .where(eq(pecasCatalogo.id, id))
  revalidatePath('/pecas')
}

export async function reativarPecaAction(id: string) {
  await verificarAcesso()
  await db.update(pecasCatalogo)
    .set({ ativo: true, atualizadoEm: new Date() })
    .where(eq(pecasCatalogo.id, id))
  revalidatePath('/pecas')
}

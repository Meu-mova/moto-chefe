'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { servicosCatalogo } from '@/lib/db/schema'
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

export type ServicoInput = {
  nome: string
  tempoPrevistoMinutos?: number | null
  valor: number
}

export async function listarServicosAction(params?: { apenasAtivos?: boolean }) {
  await verificarAcesso()
  const todos = await db.select().from(servicosCatalogo).orderBy(asc(servicosCatalogo.nome))
  return params?.apenasAtivos ? todos.filter(s => s.ativo) : todos
}

export async function criarServicoAction(input: ServicoInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  const [novo] = await db.insert(servicosCatalogo).values({
    nome,
    tempoPrevistoMinutos: input.tempoPrevistoMinutos || null,
    valor: String(input.valor),
  }).returning({ id: servicosCatalogo.id })

  revalidatePath('/servicos')
  return novo
}

export async function atualizarServicoAction(id: string, input: ServicoInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')

  await db.update(servicosCatalogo).set({
    nome,
    tempoPrevistoMinutos: input.tempoPrevistoMinutos || null,
    valor: String(input.valor),
    atualizadoEm: new Date(),
  }).where(eq(servicosCatalogo.id, id))

  revalidatePath('/servicos')
}

export async function inativarServicoAction(id: string) {
  await verificarAcesso()
  await db.update(servicosCatalogo)
    .set({ ativo: false, atualizadoEm: new Date() })
    .where(eq(servicosCatalogo.id, id))
  revalidatePath('/servicos')
}

export async function reativarServicoAction(id: string) {
  await verificarAcesso()
  await db.update(servicosCatalogo)
    .set({ ativo: true, atualizadoEm: new Date() })
    .where(eq(servicosCatalogo.id, id))
  revalidatePath('/servicos')
}

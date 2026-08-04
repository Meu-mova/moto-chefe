'use server'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
}

export async function listarGruposAction() {
  await assertAdmin()
  return db.select().from(grupos).orderBy(grupos.nome)
}

type GrupoInput = {
  nome: string
  cnpj: string
  ativo: boolean
  validapixEmail?: string
  validapixPassword?: string
  fabricaEmail?: string
  fabricaSenha?: string
  blingClientId?: string
  blingClientSecret?: string
  telegramChatId?: string
  metaMotosMes?: string
}

export async function criarGrupoAction(dados: GrupoInput) {
  await assertAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!dados.cnpj.trim()) throw new Error('CNPJ obrigatório')

  await db.insert(grupos).values({
    nome: dados.nome.trim(),
    cnpj: dados.cnpj.trim(),
    ativo: dados.ativo,
    validapixEmail: dados.validapixEmail?.trim() || null,
    validapixPassword: dados.validapixPassword?.trim() || null,
    fabricaEmail: dados.fabricaEmail?.trim() || null,
    fabricaSenha: dados.fabricaSenha?.trim() || null,
    blingClientId: dados.blingClientId?.trim() || null,
    blingClientSecret: dados.blingClientSecret?.trim() || null,
    telegramChatId: dados.telegramChatId?.trim() || null,
    metaMotosMes: dados.metaMotosMes?.trim() ? Number(dados.metaMotosMes) : null,
  })
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
}

export async function editarGrupoAction(id: string, dados: GrupoInput) {
  await assertAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!dados.cnpj.trim()) throw new Error('CNPJ obrigatório')

  await db.update(grupos).set({
    nome: dados.nome.trim(),
    cnpj: dados.cnpj.trim(),
    ativo: dados.ativo,
    validapixEmail: dados.validapixEmail?.trim() || null,
    validapixPassword: dados.validapixPassword?.trim() || null,
    fabricaEmail: dados.fabricaEmail?.trim() || null,
    fabricaSenha: dados.fabricaSenha?.trim() || null,
    blingClientId: dados.blingClientId?.trim() || null,
    blingClientSecret: dados.blingClientSecret?.trim() || null,
    telegramChatId: dados.telegramChatId?.trim() || null,
    metaMotosMes: dados.metaMotosMes?.trim() ? Number(dados.metaMotosMes) : null,
  }).where(eq(grupos.id, id))
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
}

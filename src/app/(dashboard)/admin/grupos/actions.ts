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
  blingClientId?: string
  blingClientSecret?: string
  metaMotosMes?: string
  // Qualificação da empresa no contrato de compra e venda. Sem os três, o envio
  // de contrato fica bloqueado neste grupo (ver @/lib/assinatura/documento).
  razaoSocial?: string
  enderecoSede?: string
  cidadeSede?: string
  comarcaForo?: string
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
    blingClientId: dados.blingClientId?.trim() || null,
    blingClientSecret: dados.blingClientSecret?.trim() || null,
    metaMotosMes: dados.metaMotosMes?.trim() ? Number(dados.metaMotosMes) : null,
    razaoSocial: dados.razaoSocial?.trim() || null,
    enderecoSede: dados.enderecoSede?.trim() || null,
    cidadeSede: dados.cidadeSede?.trim() || null,
    comarcaForo: dados.comarcaForo?.trim() || null,
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
    blingClientId: dados.blingClientId?.trim() || null,
    blingClientSecret: dados.blingClientSecret?.trim() || null,
    metaMotosMes: dados.metaMotosMes?.trim() ? Number(dados.metaMotosMes) : null,
    razaoSocial: dados.razaoSocial?.trim() || null,
    enderecoSede: dados.enderecoSede?.trim() || null,
    cidadeSede: dados.cidadeSede?.trim() || null,
    comarcaForo: dados.comarcaForo?.trim() || null,
  }).where(eq(grupos.id, id))
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
}

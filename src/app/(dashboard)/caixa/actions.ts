'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { lancamentosCaixa } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function criarLancamentoAction(dados: {
  lojaId: string
  tipo: 'entrada' | 'saida'
  categoria: string
  descricao?: string
  valor: string
  data: string
  vendaId?: string
  comprovanteUrl?: string
}) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const lojaIdFinal = isAdmin ? dados.lojaId : usuario.lojaId
  if (!lojaIdFinal) throw new Error('Loja inválida')
  if (!isAdmin && dados.lojaId && dados.lojaId !== usuario.lojaId) {
    throw new Error('Sem permissão para esta loja')
  }

  const valorNum = parseFloat(dados.valor)
  if (isNaN(valorNum) || valorNum <= 0) {
    throw new Error('Valor inválido')
  }

  if (dados.tipo === 'saida' && !dados.comprovanteUrl) {
    throw new Error('Comprovante obrigatório para saídas')
  }

  await db.insert(lancamentosCaixa).values({
    lojaId: lojaIdFinal,
    usuarioId: usuario.id,
    tipo: dados.tipo,
    categoria: dados.categoria,
    descricao: dados.descricao || null,
    valor: dados.valor,
    data: dados.data,
    vendaId: dados.vendaId || null,
    comprovanteUrl: dados.comprovanteUrl || null,
  })

  revalidatePath('/caixa')
  revalidatePath('/financeiro')
}

export async function uploadComprovanteAction(formData: FormData): Promise<string> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const file = formData.get('file') as File
  if (!file || file.size === 0) throw new Error('Arquivo não enviado')

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Formato não suportado. Envie JPG, PNG, WebP ou PDF.')
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Arquivo muito grande. Máximo: 10MB.')
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  const filePath = `caixa/${fileName}`

  const supabase = await createClient()
  const { error } = await supabase.storage
    .from('comprovantes')
    .upload(filePath, file, { contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  const { data: urlData } = supabase.storage
    .from('comprovantes')
    .getPublicUrl(filePath)

  return urlData.publicUrl
}

export async function excluirLancamentoAction(lancamentoId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  await db.delete(lancamentosCaixa).where(eq(lancamentosCaixa.id, lancamentoId))

  revalidatePath('/caixa')
  revalidatePath('/financeiro')
}

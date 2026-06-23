'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { lancamentosCaixa } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  }
  const ext = extMap[file.type] ?? 'bin'
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext}`
  const filePath = `caixa/${fileName}`

  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error } = await supabaseAdmin.storage
    .from('comprovantes')
    .upload(filePath, file, { contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  return filePath
}

export async function getComprovanteUrlAction(filePath: string): Promise<string> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  // Rejeita caminhos suspeitos antes de qualquer chamada ao storage
  if (!filePath.startsWith('caixa/') || filePath.includes('..') || filePath.includes('\0')) {
    throw new Error('Caminho inválido')
  }

  // Verifica que o path pertence a um lançamento real; aux_adm só acessa sua própria loja
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const whereClause = isAdmin
    ? eq(lancamentosCaixa.comprovanteUrl, filePath)
    : and(eq(lancamentosCaixa.comprovanteUrl, filePath), eq(lancamentosCaixa.lojaId, usuario.lojaId!))

  const [lancamento] = await db
    .select({ id: lancamentosCaixa.id })
    .from(lancamentosCaixa)
    .where(whereClause)
    .limit(1)

  if (!lancamento) throw new Error('Comprovante não encontrado')

  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabaseAdmin.storage
    .from('comprovantes')
    .createSignedUrl(filePath, 600)

  if (error || !data?.signedUrl) throw new Error('Erro ao gerar URL do comprovante')
  return data.signedUrl
}

export async function aprovarLancamentoAction(lancamentoId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const [lancamento] = await db
    .select({ tipo: lancamentosCaixa.tipo, status: lancamentosCaixa.statusAprovacao })
    .from(lancamentosCaixa)
    .where(eq(lancamentosCaixa.id, lancamentoId))
    .limit(1)

  if (!lancamento) throw new Error('Lançamento não encontrado')
  if (lancamento.tipo !== 'saida') throw new Error('Apenas saídas podem ser aprovadas')
  if (lancamento.status === 'aprovado') throw new Error('Lançamento já aprovado')

  await db
    .update(lancamentosCaixa)
    .set({ statusAprovacao: 'aprovado', aprovadoPorId: usuario.id, aprovadoEm: new Date() })
    .where(eq(lancamentosCaixa.id, lancamentoId))

  revalidatePath('/caixa')
}

export async function reprovarLancamentoAction(lancamentoId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const [lancamento] = await db
    .select({ tipo: lancamentosCaixa.tipo, status: lancamentosCaixa.statusAprovacao })
    .from(lancamentosCaixa)
    .where(eq(lancamentosCaixa.id, lancamentoId))
    .limit(1)

  if (!lancamento) throw new Error('Lançamento não encontrado')
  if (lancamento.tipo !== 'saida') throw new Error('Apenas saídas podem ser reprovadas')
  if (lancamento.status === 'reprovado') throw new Error('Lançamento já reprovado')

  await db
    .update(lancamentosCaixa)
    .set({ statusAprovacao: 'reprovado', aprovadoPorId: usuario.id, aprovadoEm: new Date() })
    .where(eq(lancamentosCaixa.id, lancamentoId))

  revalidatePath('/caixa')
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

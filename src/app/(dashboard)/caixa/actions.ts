'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { lancamentosCaixa } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function criarLancamentoAction(dados: {
  lojaId: string
  tipo: 'entrada' | 'saida'
  categoria: string
  descricao?: string
  valor: string
  data: string
  vendaId?: string
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

  await db.insert(lancamentosCaixa).values({
    lojaId: lojaIdFinal,
    usuarioId: usuario.id,
    tipo: dados.tipo,
    categoria: dados.categoria,
    descricao: dados.descricao || null,
    valor: dados.valor,
    data: dados.data,
    vendaId: dados.vendaId || null,
  })

  revalidatePath('/caixa')
  revalidatePath('/financeiro')
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

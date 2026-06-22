'use server'
import { createClient } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos, transferencias } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

// Service role necessário porque as RLS policies não cobrem admin_socio em
// transferencias (apenas admin_geral). A autorização é refeita server-side
// abaixo antes de qualquer chamada ao banco.
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const PAPEIS_SOLICITACAO = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'] as const
const PAPEIS_RESPOSTA    = ['admin_geral', 'admin_socio', 'aux_adm'] as const
const ADMINS             = ['admin_geral', 'admin_socio'] as const

export async function solicitarTransferenciaAction(
  motoId: string,
  lojaDestinoId: string,
  observacao?: string
) {
  const usuario = await getUsuarioLogado()
  if (!(PAPEIS_SOLICITACAO as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão para solicitar transferência')
  }

  // Não-admins só podem solicitar transferência de motos da própria loja
  if (!(ADMINS as readonly string[]).includes(usuario.papel)) {
    const [moto] = await db.select({ lojaId: motos.lojaId }).from(motos).where(eq(motos.id, motoId)).limit(1)
    if (!moto) throw new Error('Moto não encontrada')
    if (moto.lojaId !== usuario.lojaId) throw new Error('Moto não pertence à sua loja')
  }

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('solicitar_transferencia', {
    p_moto_id: motoId,
    p_loja_destino_id: lojaDestinoId,
    p_solicitado_por: usuario.id,
    p_observacao: observacao ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}

export async function aceitarTransferenciaAction(transferenciaId: string) {
  const usuario = await getUsuarioLogado()
  if (!(PAPEIS_RESPOSTA as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão para aceitar transferência')
  }

  // Não-admins só podem aceitar transferências destinadas à própria loja
  if (!(ADMINS as readonly string[]).includes(usuario.papel)) {
    const [transf] = await db
      .select({ lojaDestinoId: transferencias.lojaDestinoId })
      .from(transferencias)
      .where(eq(transferencias.id, transferenciaId))
      .limit(1)
    if (!transf) throw new Error('Transferência não encontrada')
    if (transf.lojaDestinoId !== usuario.lojaId) throw new Error('Sem permissão para aceitar esta transferência')
  }

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('aceitar_transferencia', {
    p_transferencia_id: transferenciaId,
    p_respondido_por: usuario.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}

export async function recusarTransferenciaAction(transferenciaId: string, observacao: string) {
  const usuario = await getUsuarioLogado()
  if (!(PAPEIS_RESPOSTA as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão para recusar transferência')
  }

  // Não-admins só podem recusar transferências destinadas à própria loja
  if (!(ADMINS as readonly string[]).includes(usuario.papel)) {
    const [transf] = await db
      .select({ lojaDestinoId: transferencias.lojaDestinoId })
      .from(transferencias)
      .where(eq(transferencias.id, transferenciaId))
      .limit(1)
    if (!transf) throw new Error('Transferência não encontrada')
    if (transf.lojaDestinoId !== usuario.lojaId) throw new Error('Sem permissão para recusar esta transferência')
  }

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('recusar_transferencia', {
    p_transferencia_id: transferenciaId,
    p_respondido_por: usuario.id,
    p_observacao: observacao,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}

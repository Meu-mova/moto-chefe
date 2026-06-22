'use server'
import { createClient } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function solicitarTransferenciaAction(
  motoId: string,
  lojaDestinoId: string,
  observacao?: string
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para solicitar transferência')
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
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para aceitar transferência')
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
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para recusar transferência')
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

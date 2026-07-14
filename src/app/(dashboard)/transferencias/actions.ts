'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { transferencias } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const ADMINS = ['admin_geral', 'admin_socio']

// aux_adm só pode responder por transferências destinadas à própria loja —
// a tela já esconde o botão pra outras lojas, mas isso reforça no servidor
// (antes só o RPC checava "status pendente", não a loja de quem responde).
async function checarLojaDestino(usuario: { papel: string; lojaId: string | null }, transferenciaId: string) {
  if (ADMINS.includes(usuario.papel)) return
  const [t] = await db
    .select({ lojaDestinoId: transferencias.lojaDestinoId })
    .from(transferencias)
    .where(eq(transferencias.id, transferenciaId))
    .limit(1)
  if (!t || t.lojaDestinoId !== usuario.lojaId) {
    throw new Error('Sem permissão para responder transferência de outra loja')
  }
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
  const supabase = await createClient()
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
  await checarLojaDestino(usuario, transferenciaId)
  const supabase = await createClient()
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
  await checarLojaDestino(usuario, transferenciaId)
  const supabase = await createClient()
  const { error } = await supabase.rpc('recusar_transferencia', {
    p_transferencia_id: transferenciaId,
    p_respondido_por: usuario.id,
    p_observacao: observacao,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}

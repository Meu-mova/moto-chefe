'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function abrirOSAction(
  motoId: string,
  mecanicoId: string | null,
  descricao: string,
  clienteId?: string | null
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para abrir OS')
  }
  if (!usuario.lojaId && !['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    throw new Error('Usuário sem loja associada')
  }
  const supabase = await createClient()
  const { data: osId, error } = await supabase.rpc('abrir_ordem_servico', {
    p_moto_id: motoId,
    p_loja_id: usuario.lojaId,
    p_aberta_por: usuario.id,
    p_mecanico_id: mecanicoId ?? null,
    p_descricao: descricao,
  })
  if (error) throw new Error(error.message)
  if (clienteId && osId) {
    const { error: updateError } = await supabase
      .from('ordens_servico')
      .update({ cliente_id: clienteId })
      .eq('id', osId as string)
    if (updateError) throw new Error(updateError.message)
  }
  revalidatePath('/ordens-servico')
  revalidatePath(`/estoque/${motoId}`)
}

export async function atualizarStatusOSAction(osId: string, novoStatus: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'mecanico'].includes(usuario.papel)) {
    throw new Error('Sem permissão para atualizar OS')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('atualizar_status_os', {
    p_os_id: osId,
    p_novo_status: novoStatus,
    p_usuario_id: usuario.id,
    p_papel: usuario.papel,
    p_loja_usuario_id: usuario.lojaId ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/ordens-servico')
}

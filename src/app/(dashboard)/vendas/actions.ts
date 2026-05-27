'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function criarPedidoVendaAction(motoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para criar pedido de venda')
  }
  const supabase = await createClient()

  const [moto] = await db.select({ lojaId: motos.lojaId }).from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  // RPC signature: criar_pedido_venda(p_moto_id, p_loja_id, p_vendedor_id, p_observacao)
  const { error } = await supabase.rpc('criar_pedido_venda', {
    p_moto_id: motoId,
    p_loja_id: moto.lojaId,
    p_vendedor_id: usuario.id,
    p_observacao: observacao ?? null,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

export async function cancelarPedidoAction(pedidoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancelar_pedido_venda', {
    p_pedido_id: pedidoId,
    p_usuario_id: usuario.id,
    p_papel: usuario.papel,
    p_loja_usuario_id: usuario.lojaId ?? null,
    p_observacao: observacao ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

export async function efetivarVendaAction(
  pedidoId: string,
  clienteNome: string,
  clienteCpf: string,
  valor: string,
  formaPagamento: string
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para efetivar venda')
  }
  const supabase = await createClient()
  // RPC signature: efetivar_venda(p_pedido_id, p_efetivado_por, p_cliente_nome, p_cliente_cpf, p_valor, p_forma_pagamento)
  const { error } = await supabase.rpc('efetivar_venda', {
    p_pedido_id: pedidoId,
    p_efetivado_por: usuario.id,
    p_cliente_nome: clienteNome,
    p_cliente_cpf: clienteCpf,
    p_valor: parseFloat(valor),
    p_forma_pagamento: formaPagamento,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

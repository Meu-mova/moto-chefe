'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { motos, garantias } from '@/lib/db/schema'
import { eq, isNotNull } from 'drizzle-orm'
import { loginFabrica, buscarStatusGarantiaFabrica } from '@/lib/fabrica-scraper'

export async function abrirGarantiaAction(params: {
  motoId: string
  osId?: string
  descricao: string
  dataInicio: string
  dataPedidoPeca?: string
  numeroPedidoFabrica?: string
}) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para abrir garantia')
  }

  // O RPC valida que moto.loja_id == p_loja_id; admins não têm lojaId próprio,
  // então sempre buscamos a loja da moto para passar ao RPC.
  const [moto] = await db
    .select({ lojaId: motos.lojaId })
    .from(motos)
    .where(eq(motos.id, params.motoId))
    .limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  // Prazo fixo de 30 dias a partir da data de abertura
  const fim = new Date(params.dataInicio)
  fim.setDate(fim.getDate() + 30)
  const dataFim = fim.toISOString().split('T')[0]

  const supabase = await createClient()
  const { error } = await supabase.rpc('abrir_garantia', {
    p_moto_id: params.motoId,
    p_loja_id: moto.lojaId,
    p_aberta_por: usuario.id,
    p_os_id: params.osId ?? null,
    p_descricao: params.descricao,
    p_data_inicio: params.dataInicio,
    p_data_fim: dataFim,
    p_data_pedido_peca: params.dataPedidoPeca ?? null,
    p_numero_pedido_fabrica: params.numeroPedidoFabrica ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/garantias')
  revalidatePath('/vendas')
  revalidatePath(`/estoque/${params.motoId}`)
}

export async function sincronizarFabricaAction() {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const lista = await db
    .select({ id: garantias.id, numeroPedidoFabrica: garantias.numeroPedidoFabrica })
    .from(garantias)
    .where(isNotNull(garantias.numeroPedidoFabrica))

  if (lista.length === 0) return { atualizadas: 0, erros: 0 }

  const session = await loginFabrica()
  const agora = new Date()
  let atualizadas = 0
  let erros = 0

  for (const g of lista) {
    if (!g.numeroPedidoFabrica) continue
    try {
      const status = await buscarStatusGarantiaFabrica(session, g.numeroPedidoFabrica)
      await db
        .update(garantias)
        .set({ statusFabrica: status, statusFabricaSyncEm: agora })
        .where(eq(garantias.id, g.id))
      atualizadas++
    } catch {
      erros++
    }
  }

  revalidatePath('/garantias')
  return { atualizadas, erros }
}

export async function encerrarGarantiaAction(garantiaId: string, observacao?: string, dataEncerramento?: string) {
  const usuario = await getUsuarioLogado()
  const supabase = await createClient()
  const { error } = await supabase.rpc('encerrar_garantia', {
    p_garantia_id: garantiaId,
    p_usuario_id: usuario.id,
    p_papel: usuario.papel,
    p_loja_usuario_id: usuario.lojaId ?? null,
    p_observacao: observacao ?? null,
    p_data_encerramento: dataEncerramento ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/garantias')
  revalidatePath('/estoque')
}

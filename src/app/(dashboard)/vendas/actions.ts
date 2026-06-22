'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos, pedidosVenda, vendas, reservas, historicoEstoque, lancamentosCaixa, garantias } from '@/lib/db/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function criarPedidoVendaAction(motoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para criar pedido de venda')
  }
  const supabase = await createClient()

  const [moto] = await db.select({ lojaId: motos.lojaId }).from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

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
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para efetivar venda')
  }
  const supabase = await createClient()
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

// ─── Venda completa direto do estoque ────────────────────────────────────────

type DadosVendaCompleta = {
  motoId: string
  vendedorId?: string
  clienteNome: string
  clienteCpf: string
  clienteCelular: string
  clienteEmail: string
  clienteCep: string
  clienteLogradouro: string
  clienteNumero: string
  clienteComplemento: string
  clienteBairro: string
  clienteCidade: string
  clienteEstado: string
  valorTotal: string
  dataVenda?: string
  pagamentos: { tipo: string; valor: number; operadora?: string; parcelas?: number }[]
}

export async function registrarVendaCompletaAction(data: DadosVendaCompleta) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para registrar venda')
  }

  const [moto] = await db.select().from(motos).where(eq(motos.id, data.motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')
  if (moto.status === 'caixa') {
    throw new Error('Moto ainda não foi montada — não pode ser vendida')
  }
  if (moto.status === 'vendida') {
    throw new Error('Moto já foi vendida')
  }

  const valorNum = parseFloat(data.valorTotal)
  if (isNaN(valorNum) || valorNum <= 0) throw new Error('Valor inválido')

  const soma = data.pagamentos.reduce((a, p) => a + p.valor, 0)
  if (Math.abs(soma - valorNum) > 0.01) {
    throw new Error('Somatório das formas de pagamento difere do valor da venda')
  }

  const podeEscolherVendedor = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const vendedorId = (podeEscolherVendedor && data.vendedorId) ? data.vendedorId : usuario.id

  const dataVendaFinal = data.dataVenda ? new Date(data.dataVenda + 'T12:00:00') : new Date()

  await db.transaction(async (tx) => {
    // Verificar reserva ativa para linkar
    const [reservaAtiva] = await tx
      .select({ id: reservas.id })
      .from(reservas)
      .where(and(eq(reservas.motoId, data.motoId), eq(reservas.status, 'ativa')))
      .limit(1)

    // Criar pedido já efetivado
    const [pedido] = await tx.insert(pedidosVenda).values({
      motoId: data.motoId,
      lojaId: moto.lojaId,
      vendedorId,
      status: 'efetivado',
      observacao: null,
      dataPedido: dataVendaFinal,
      dataAtualizacao: dataVendaFinal,
    }).returning({ id: pedidosVenda.id })
    const [venda] = await tx.insert(vendas).values({
      pedidoVendaId: pedido.id,
      motoId: data.motoId,
      lojaId: moto.lojaId,
      vendedorId,
      efetivadoPor: usuario.id,
      clienteNome: data.clienteNome,
      clienteCpf: data.clienteCpf,
      clienteCelular: data.clienteCelular,
      clienteEmail: data.clienteEmail,
      clienteCep: data.clienteCep,
      clienteLogradouro: data.clienteLogradouro,
      clienteNumero: data.clienteNumero,
      clienteComplemento: data.clienteComplemento,
      clienteBairro: data.clienteBairro,
      clienteCidade: data.clienteCidade,
      clienteEstado: data.clienteEstado,
      valor: data.valorTotal,
      formaPagamento: data.pagamentos[0].tipo,
      pagamentos: data.pagamentos,
      reservaId: reservaAtiva?.id ?? null,
      dataVenda: dataVendaFinal,
    }).returning({ id: vendas.id })

    // Marcar reserva como convertida
    if (reservaAtiva) {
      await tx.update(reservas)
        .set({ status: 'convertida' })
        .where(eq(reservas.id, reservaAtiva.id))
    }

    // Moto fica em estoque com status 'vendida' até a NF de saída ser confirmada
    await tx.update(motos)
      .set({ status: 'vendida' as any, disponibilidade: null })
      .where(eq(motos.id, data.motoId))

    // Histórico
    const tipoLabel: Record<string, string> = {
      pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
      cartao_debito: 'Cartão de Débito', financiamento: 'Financiamento',
      link_pagamento: 'Link de Pagamento', transferencia: 'Transferência',
    }
    const descPagamentos = data.pagamentos
      .map(p => `${tipoLabel[p.tipo] ?? p.tipo}: R$ ${p.valor.toFixed(2)}`)
      .join(' + ')
    await tx.insert(historicoEstoque).values({
      motoId: data.motoId,
      lojaOrigemId: moto.lojaId,
      usuarioId: usuario.id,
      tipo: 'saida',
      referenciaTipo: 'pedido_venda',
      referenciaId: pedido.id,
      observacao: `Venda — Cliente: ${data.clienteNome} — Total: R$ ${valorNum.toFixed(2)} — ${descPagamentos}`,
    })

    // Registrar pagamentos em dinheiro no caixa automaticamente
    const pagamentosDinheiro = data.pagamentos.filter(p => p.tipo === 'dinheiro')
    for (const pgto of pagamentosDinheiro) {
      await tx.insert(lancamentosCaixa).values({
        lojaId: moto.lojaId,
        usuarioId: usuario.id,
        tipo: 'entrada',
        categoria: 'Venda',
        descricao: `Venda dinheiro — ${data.clienteNome}`,
        valor: pgto.valor.toFixed(2),
        data: dataVendaFinal.toISOString().split('T')[0],
        vendaId: venda.id,
      })
    }
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath('/caixa')
}

// ─── Confirmar NF de Saída ───────────────────────────────────────────────────

export async function confirmarNFSaidaAction(motoId: string, notaFiscal: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para confirmar NF de saída')
  }

  const [venda] = await db
    .select({ id: vendas.id })
    .from(vendas)
    .where(and(eq(vendas.motoId, motoId), isNull(vendas.notaFiscalSaida)))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  if (!venda) throw new Error('Nenhuma venda pendente de NF encontrada para esta moto')

  await db.transaction(async (tx) => {
    await tx.update(vendas)
      .set({ notaFiscalSaida: notaFiscal })
      .where(eq(vendas.id, venda.id))

    await tx.update(motos)
      .set({ disponibilidade: 'vendida' as any })
      .where(eq(motos.id, motoId))
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

// ─── Cancelar Venda ─────────────────────────────────────────────────────────

export async function cancelarVendaCompletaAction(vendaId: string, motivo: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    throw new Error('Apenas administradores e sócios podem cancelar vendas')
  }

  if (!motivo.trim()) {
    throw new Error('Informe o motivo do cancelamento')
  }

  const [vendaRecord] = await db
    .select({
      id: vendas.id,
      motoId: vendas.motoId,
      lojaId: vendas.lojaId,
      pedidoVendaId: vendas.pedidoVendaId,
      clienteNome: vendas.clienteNome,
      valor: vendas.valor,
    })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1)

  if (!vendaRecord) throw new Error('Venda não encontrada')

  await db.transaction(async (tx) => {
    // Reverter moto para montada/disponível
    await tx.update(motos)
      .set({ status: 'montada', disponibilidade: 'disponivel' })
      .where(eq(motos.id, vendaRecord.motoId))

    // Cancelar o pedido de venda
    await tx.update(pedidosVenda)
      .set({ status: 'cancelado' })
      .where(eq(pedidosVenda.id, vendaRecord.pedidoVendaId))

    // Remover a venda
    await tx.delete(vendas).where(eq(vendas.id, vendaId))

    // Remover lançamentos de caixa vinculados
    await tx.delete(lancamentosCaixa).where(eq(lancamentosCaixa.vendaId, vendaId))

    // Desvincular garantias (FK impede DELETE da venda se houver garantia linkada)
    await tx.update(garantias).set({ vendaId: null }).where(eq(garantias.vendaId, vendaId))

    // Registrar no histórico
    await tx.insert(historicoEstoque).values({
      motoId: vendaRecord.motoId,
      lojaDestinoId: vendaRecord.lojaId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      statusAnterior: 'vendida',
      statusNovo: 'montada',
      observacao: `Venda cancelada — Cliente: ${vendaRecord.clienteNome} — Valor: R$ ${Number(vendaRecord.valor).toFixed(2)} — Motivo: ${motivo}`,
    })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath('/caixa')
  revalidatePath('/dashboard')
}

// ─── Reserva ─────────────────────────────────────────────────────────────────

type DadosReserva = {
  motoId: string
  vendedorId?: string
  clienteNome: string
  clienteCpf: string
  clienteCelular: string
  clienteEmail: string
  clienteCep: string
  clienteLogradouro: string
  clienteNumero: string
  clienteComplemento: string
  clienteBairro: string
  clienteCidade: string
  clienteEstado: string
  valorReserva: string
  valorTotalVenda: string
  meioPagamento: string
  cartaoOperadora?: string
  cartaoParcelas?: number
  dataPrevistaFinalizacao: string
  dataReserva?: string
}

export async function registrarReservaAction(data: DadosReserva) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para registrar reserva')
  }

  const [moto] = await db.select().from(motos).where(eq(motos.id, data.motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')
  if (moto.status === 'vendida' || moto.disponibilidade === 'vendida') {
    throw new Error('Moto já foi vendida')
  }
  if (moto.disponibilidade === 'reservada') {
    throw new Error('Moto já está reservada')
  }

  const valorNum = parseFloat(data.valorReserva)
  if (isNaN(valorNum) || valorNum <= 0) throw new Error('Valor de reserva inválido')

  const podeEscolherVendedorReserva = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const vendedorIdReserva = (podeEscolherVendedorReserva && data.vendedorId) ? data.vendedorId : usuario.id

  await db.transaction(async (tx) => {
    const valorTotalNum = parseFloat(data.valorTotalVenda)

    const dataReservaFinal = data.dataReserva ? new Date(data.dataReserva + 'T12:00:00') : new Date()
    await tx.insert(reservas).values({
      motoId: data.motoId,
      lojaId: moto.lojaId,
      vendedorId: vendedorIdReserva,
      valorReserva: data.valorReserva,
      valorTotalVenda: data.valorTotalVenda,
      meioPagamento: data.meioPagamento,
      cartaoOperadora: data.cartaoOperadora ?? null,
      cartaoParcelas: data.cartaoParcelas ? String(data.cartaoParcelas) : null,
      dataPrevistaFinalizacao: data.dataPrevistaFinalizacao,
      status: 'ativa',
      clienteNome: data.clienteNome,
      clienteCpf: data.clienteCpf,
      clienteCelular: data.clienteCelular,
      clienteEmail: data.clienteEmail,
      clienteCep: data.clienteCep,
      clienteLogradouro: data.clienteLogradouro,
      clienteNumero: data.clienteNumero,
      clienteComplemento: data.clienteComplemento,
      clienteBairro: data.clienteBairro,
      clienteCidade: data.clienteCidade,
      clienteEstado: data.clienteEstado,
      criadoEm: dataReservaFinal,
    })

    await tx.update(motos)
      .set({ disponibilidade: 'reservada' })
      .where(eq(motos.id, data.motoId))

    const meioLabel: Record<string, string> = {
      pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
      cartao_debito: 'Cartão de Débito', financiamento: 'Financiamento',
      link_pagamento: 'Link de Pagamento', transferencia: 'Transferência',
    }
    await tx.insert(historicoEstoque).values({
      motoId: data.motoId,
      lojaOrigemId: moto.lojaId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      observacao: `Reserva — Cliente: ${data.clienteNome} — Entrada: R$ ${valorNum.toFixed(2)} — Total: R$ ${valorTotalNum.toFixed(2)} — ${meioLabel[data.meioPagamento] ?? data.meioPagamento} — Previsão: ${data.dataPrevistaFinalizacao}`,
    })
  })

  revalidatePath('/estoque')
}

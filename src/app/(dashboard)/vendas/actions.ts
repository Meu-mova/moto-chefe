'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos, modelos, pedidosVenda, vendas, reservas, historicoEstoque, lancamentosCaixa, precificacao, configuracaoTaxas, usuarios } from '@/lib/db/schema'
import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { calcLiquidoRecebido, validarReserva } from '@/lib/preco-minimo'

export type PrecoMinimoInfo = {
  valorMinimoPix: number
  taxas: {
    taxasCartao: Record<string, number>
    taxasDebito: Record<string, number>
    taxasLink: Record<string, number>
    taxasFinanciamento: Record<string, number>
  }
}

export async function buscarPrecoMinimoAction(motoId: string): Promise<PrecoMinimoInfo | null> {
  const [moto] = await db.select({ modeloId: motos.modeloId }).from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) return null
  return buscarPrecificacao(moto.modeloId)
}

async function buscarPrecificacao(modeloId: string) {
  const [modeloRow] = await db
    .select({ modelo: modelos.modelo })
    .from(modelos).where(eq(modelos.id, modeloId)).limit(1)
  if (!modeloRow) return null

  const [[precRow], [taxasRow]] = await Promise.all([
    db.select({ valorMinimo: precificacao.valorMinimo })
      .from(precificacao)
      .where(and(eq(precificacao.nome, modeloRow.modelo), eq(precificacao.ativo, true)))
      .limit(1),
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.id, 1)),
  ])

  if (!precRow || !taxasRow) return null
  return {
    valorMinimoPix: parseFloat(precRow.valorMinimo),
    taxas: {
      taxasCartao: taxasRow.taxasCartao as Record<string, number>,
      taxasDebito: (taxasRow.taxasDebito ?? {}) as Record<string, number>,
      taxasLink: taxasRow.taxasLink as Record<string, number>,
      taxasFinanciamento: taxasRow.taxasFinanciamento as Record<string, number>,
    },
  }
}

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
  pagamentos: { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }[]
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

  const prec = await buscarPrecificacao(moto.modeloId)
  if (prec) {
    const liquido = calcLiquidoRecebido(data.pagamentos, prec.taxas)
    if (liquido < prec.valorMinimoPix - 0.01) {
      const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      throw new Error(
        `Valor abaixo do mínimo: líquido estimado ${fmt(liquido)} — mínimo PIX ${fmt(prec.valorMinimoPix)}`
      )
    }
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

    // Remover lancamentos antes da venda (lancamentos_caixa tem FK para vendas.id)
    await tx.delete(lancamentosCaixa).where(eq(lancamentosCaixa.vendaId, vendaId))

    // Remover a venda
    await tx.delete(vendas).where(eq(vendas.id, vendaId))

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

  const prec = await buscarPrecificacao(moto.modeloId)
  if (prec) {
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const valorTotalNum = parseFloat(data.valorTotalVenda)
    const check = validarReserva(valorNum, isNaN(valorTotalNum) ? 0 : valorTotalNum, prec.valorMinimoPix)
    if (!check.entradaOk) {
      throw new Error(`Entrada mínima de ${fmt(check.minimoEntrada)} (30% do preço PIX ${fmt(prec.valorMinimoPix)})`)
    }
    // Total negociado é livre — depende da forma de pagamento (PIX, cartão, etc.)
    // Apenas a entrada mínima de 30% é obrigatória para reservas
  }

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

export type PagamentoEditar = {
  tipo: string
  valor: number
  operadora?: string
  parcelas?: number
  autorizacao?: string
}

export async function editarVendaAction(vendaId: string, dados: {
  valor:              string
  dataVenda:          string
  notaFiscalSaida?:   string | null
  pagamentos:         PagamentoEditar[]
  vendedorId?:        string
  clienteNome:        string
  clienteCpf:         string
  clienteCelular?:    string | null
  clienteEmail?:      string | null
  clienteCep?:        string | null
  clienteLogradouro?: string | null
  clienteNumero?:     string | null
  clienteComplemento?:string | null
  clienteBairro?:     string | null
  clienteCidade?:     string | null
  clienteEstado?:     string | null
}) {
  const usuario = await getUsuarioLogado()

  const ADMINS_EDIT = ['admin_geral', 'admin_socio', 'aux_adm']
  if (!ADMINS_EDIT.includes(usuario.papel)) throw new Error('Sem permissão')

  // Busca venda atual para validações de acesso e sincronização
  const [vendaAtual] = await db
    .select({ lojaId: vendas.lojaId, notaFiscalSaida: vendas.notaFiscalSaida })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1)
  if (!vendaAtual) throw new Error('Venda não encontrada')

  // Todos os papéis só podem editar vendas da própria loja
  if (usuario.lojaId && vendaAtual.lojaId !== usuario.lojaId) {
    throw new Error('Sem permissão para editar vendas de outra loja')
  }

  // ── Validação financeira ─────────────────────────────────────────────────────
  const valorNum = parseFloat(dados.valor.replace(',', '.'))
  if (!valorNum || valorNum <= 0) throw new Error('Valor da venda inválido')

  for (const p of dados.pagamentos) {
    if (!p.valor || p.valor <= 0) throw new Error('Valor de pagamento inválido')
  }

  const somaPayments = dados.pagamentos.reduce((s, p) => s + Number(p.valor), 0)
  if (Math.abs(somaPayments - valorNum) > 0.01) {
    throw new Error('Soma dos pagamentos não confere com o valor total')
  }

  // ── NF de saída: só permite corrigir uma NF já existente ────────────────────
  // Para adicionar uma NF nova, use o botão "Confirmar NF de Saída"
  const nfFinal = vendaAtual.notaFiscalSaida
    ? (dados.notaFiscalSaida?.trim() || vendaAtual.notaFiscalSaida)
    : vendaAtual.notaFiscalSaida

  const formaPagamento = dados.pagamentos.length === 1
    ? dados.pagamentos[0].tipo
    : 'multiplos'

  await db.transaction(async tx => {
    // Atualiza a venda
    await tx.update(vendas)
      .set({
        valor:              dados.valor,
        dataVenda:          new Date(dados.dataVenda),
        notaFiscalSaida:    nfFinal,
        pagamentos:         dados.pagamentos,
        formaPagamento,
        ...(dados.vendedorId ? { vendedorId: dados.vendedorId } : {}),
        clienteNome:        dados.clienteNome,
        clienteCpf:         dados.clienteCpf,
        clienteCelular:     dados.clienteCelular || null,
        clienteEmail:       dados.clienteEmail || null,
        clienteCep:         dados.clienteCep || null,
        clienteLogradouro:  dados.clienteLogradouro || null,
        clienteNumero:      dados.clienteNumero || null,
        clienteComplemento: dados.clienteComplemento || null,
        clienteBairro:      dados.clienteBairro || null,
        clienteCidade:      dados.clienteCidade || null,
        clienteEstado:      dados.clienteEstado || null,
      })
      .where(eq(vendas.id, vendaId))

    // Sincroniza lançamentos de dinheiro no caixa: apaga os antigos e recria
    await tx.delete(lancamentosCaixa)
      .where(and(eq(lancamentosCaixa.vendaId, vendaId), eq(lancamentosCaixa.tipo, 'entrada')))

    const pagamentosDinheiro = dados.pagamentos.filter(p => p.tipo === 'dinheiro')
    for (const pgto of pagamentosDinheiro) {
      await tx.insert(lancamentosCaixa).values({
        lojaId:    vendaAtual.lojaId,
        usuarioId: usuario.id,
        tipo:      'entrada',
        categoria: 'Venda',
        descricao: `Venda dinheiro (editado) — ${dados.clienteNome}`,
        valor:     pgto.valor.toFixed(2),
        data:      dados.dataVenda,
        vendaId,
      })
    }
  })

  revalidatePath('/vendas')
  revalidatePath('/caixa')
}

export async function buscarHistoricoMotoAction(motoId: string) {
  const usuario = await getUsuarioLogado()

  const [moto] = await db
    .select({ lojaId: motos.lojaId })
    .from(motos)
    .where(eq(motos.id, motoId))
    .limit(1)
  if (!moto) return []

  const ADMINS = ['admin_geral', 'admin_socio', 'aux_adm']
  if (!ADMINS.includes(usuario.papel) && moto.lojaId !== usuario.lojaId) {
    throw new Error('Sem permissão')
  }

  return db
    .select({
      id:            historicoEstoque.id,
      tipo:          historicoEstoque.tipo,
      statusAnterior: historicoEstoque.statusAnterior,
      statusNovo:    historicoEstoque.statusNovo,
      data:          historicoEstoque.data,
      observacao:    historicoEstoque.observacao,
      usuarioNome:   usuarios.nome,
    })
    .from(historicoEstoque)
    .leftJoin(usuarios, eq(historicoEstoque.usuarioId, usuarios.id))
    .where(eq(historicoEstoque.motoId, motoId))
    .orderBy(sql`${historicoEstoque.data} DESC`)
}

'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos, modelos, modeloBlingCodigos, pedidosVenda, vendas, reservas, historicoEstoque, lancamentosCaixa, precificacao, configuracaoTaxas, usuarios, clientes, aprovacoesVenda, demandas } from '@/lib/db/schema'
import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { calcLiquidoRecebido, validarReserva } from '@/lib/preco-minimo'
import { getGrupoIdDaLoja, podeAprovarVendaBaixoValor, podeAprovarPagamentoSensivel } from '@/lib/grupo'
import { aplicarPagamentoOS, type DadosPagamentoOS } from '../ordens-servico/actions'
import { aplicarVendaPeca, type DadosVendaPeca } from '../pecas/actions'
import { virarLeadKommo, type ResultadoVirarLead } from '@/lib/kommo'

const TIPOS_PAGAMENTO_SENSIVEL = new Set(['financiamento', 'transferencia'])
function temPagamentoSensivel(pagamentos: { tipo: string }[]): boolean {
  return pagamentos.some(p => TIPOS_PAGAMENTO_SENSIVEL.has(p.tipo))
}

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
  const [moto] = await db.select({ modeloId: motos.modeloId, lojaId: motos.lojaId }).from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) return null
  return buscarPrecificacao(moto.modeloId, moto.lojaId)
}

async function buscarPrecificacao(modeloId: string, lojaId: string) {
  const [modeloRow, grupoId] = await Promise.all([
    db.select({ modelo: modelos.modelo }).from(modelos).where(eq(modelos.id, modeloId)).limit(1).then(r => r[0]),
    getGrupoIdDaLoja(lojaId),
  ])
  if (!modeloRow) return null

  const [[precRow], [taxasRow]] = await Promise.all([
    db.select({ valorMinimo: precificacao.valorMinimo })
      .from(precificacao)
      .where(and(eq(precificacao.nome, modeloRow.modelo), eq(precificacao.ativo, true), eq(precificacao.grupoId, grupoId)))
      .limit(1),
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.grupoId, grupoId)),
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
  formaPagamento: string,
  clienteId?: string
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para efetivar venda')
  }
  if (TIPOS_PAGAMENTO_SENSIVEL.has(formaPagamento) && !podeAprovarPagamentoSensivel(usuario)) {
    throw new Error('Venda com financiamento ou transferência bancária precisa de aprovação — use o fluxo de venda pela ficha da moto (Vender) para pedir aprovação.')
  }
  const supabase = await createClient()
  const { data: vendaId, error } = await supabase.rpc('efetivar_venda', {
    p_pedido_id: pedidoId,
    p_efetivado_por: usuario.id,
    p_cliente_nome: clienteNome,
    p_cliente_cpf: clienteCpf,
    p_valor: parseFloat(valor),
    p_forma_pagamento: formaPagamento,
  })
  if (error) throw new Error(error.message)
  if (clienteId && vendaId) {
    const { error: updateError } = await supabase
      .from('vendas')
      .update({ cliente_id: clienteId })
      .eq('id', vendaId as string)
    if (updateError) throw new Error(updateError.message)
  }
  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

// ─── Venda completa direto do estoque ────────────────────────────────────────

type DadosVendaCompleta = {
  motoId: string
  vendedorId?: string
  demandaVinculadaId?: string | null
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

async function criarVendaTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    moto: { id: string; lojaId: string }
    data: DadosVendaCompleta
    vendedorId: string
    efetivadoPor: string
    dataVendaFinal: Date
  }
): Promise<{ vendaId: string }> {
  const { moto, data, vendedorId, efetivadoPor, dataVendaFinal } = params
  const valorNum = parseFloat(data.valorTotal)

  // Verificar reserva ativa para linkar
  const [reservaAtiva] = await tx
    .select({ id: reservas.id })
    .from(reservas)
    .where(and(eq(reservas.motoId, moto.id), eq(reservas.status, 'ativa')))
    .limit(1)

  // Criar pedido já efetivado
  const [pedido] = await tx.insert(pedidosVenda).values({
    motoId: moto.id,
    lojaId: moto.lojaId,
    vendedorId,
    status: 'efetivado',
    observacao: null,
    dataPedido: dataVendaFinal,
    dataAtualizacao: dataVendaFinal,
  }).returning({ id: pedidosVenda.id })

  // Upsert cliente por CPF — cria se não existir, atualiza se existir
  const cpfLimpo = data.clienteCpf.replace(/\D/g, '')
  let clienteVinculadoId: string | null = null
  if (cpfLimpo.length >= 11) {
    const [clienteUpsert] = await tx
      .insert(clientes)
      .values({
        nome:        data.clienteNome.trim(),
        cpfCnpj:     cpfLimpo,
        email:       data.clienteEmail        || null,
        celular:     data.clienteCelular       || null,
        endereco:    data.clienteLogradouro    || null,
        numero:      data.clienteNumero        || null,
        complemento: data.clienteComplemento   || null,
        bairro:      data.clienteBairro        || null,
        cep:         data.clienteCep           || null,
        cidade:      data.clienteCidade        || null,
        uf:          data.clienteEstado        || null,
      })
      .onConflictDoUpdate({
        target: clientes.cpfCnpj,
        set: {
          nome:        sql`excluded.nome`,
          email:       sql`excluded.email`,
          celular:     sql`excluded.celular`,
          endereco:    sql`excluded.endereco`,
          numero:      sql`excluded.numero`,
          complemento: sql`excluded.complemento`,
          bairro:      sql`excluded.bairro`,
          cep:         sql`excluded.cep`,
          cidade:      sql`excluded.cidade`,
          uf:          sql`excluded.uf`,
          atualizadoEm: sql`now()`,
        },
      })
      .returning({ id: clientes.id })
    clienteVinculadoId = clienteUpsert?.id ?? null
  }

  const [venda] = await tx.insert(vendas).values({
    pedidoVendaId: pedido.id,
    motoId: moto.id,
    lojaId: moto.lojaId,
    vendedorId,
    efetivadoPor,
    clienteId:    clienteVinculadoId,
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

  // Vincular demanda (fluxo "vincular a demanda existente") → marca como atendida.
  // Restringe à loja da moto e a demandas ainda abertas — evita IDOR (marcar
  // demanda de outra loja) e corrida (revincular uma já atendida).
  if (data.demandaVinculadaId) {
    await tx.update(demandas)
      .set({ status: 'atendida', vendaId: venda.id })
      .where(and(
        eq(demandas.id, data.demandaVinculadaId),
        eq(demandas.status, 'aberta'),
        eq(demandas.lojaId, moto.lojaId),
      ))
  }

  // Moto fica em estoque com status 'vendida' até a NF de saída ser confirmada
  await tx.update(motos)
    .set({ status: 'vendida' as any, disponibilidade: null })
    .where(eq(motos.id, moto.id))

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
    motoId: moto.id,
    lojaOrigemId: moto.lojaId,
    usuarioId: efetivadoPor,
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
      usuarioId: efetivadoPor,
      tipo: 'entrada',
      categoria: 'Venda',
      descricao: `Venda dinheiro — ${data.clienteNome}`,
      valor: pgto.valor.toFixed(2),
      data: dataVendaFinal.toISOString().split('T')[0],
      vendaId: venda.id,
    })
  }

  return { vendaId: venda.id }
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
  if (moto.disponibilidade === 'aguardando_aprovacao') {
    throw new Error('Moto tem uma venda aguardando aprovação — aprove ou recuse antes de vender')
  }

  const valorNum = parseFloat(data.valorTotal)
  if (isNaN(valorNum) || valorNum <= 0) throw new Error('Valor inválido')

  const soma = data.pagamentos.reduce((a, p) => a + p.valor, 0)
  if (Math.abs(soma - valorNum) > 0.01) {
    throw new Error('Somatório das formas de pagamento difere do valor da venda')
  }

  // Financiamento/transferência sempre precisam da aprovação do responsável,
  // independente de valor ou papel — ver podeAprovarPagamentoSensivel.
  if (temPagamentoSensivel(data.pagamentos) && !podeAprovarPagamentoSensivel(usuario)) {
    throw new Error('Venda com financiamento ou transferência bancária precisa de aprovação. Peça aprovação em vez de salvar direto.')
  }

  // admin_geral/admin_socio podem vender abaixo do mínimo direto (auto-aprovação);
  // os demais papéis devem usar solicitarAprovacaoVendaAction nesse caso.
  const podeVenderAbaixoDoMinimo = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const prec = await buscarPrecificacao(moto.modeloId, moto.lojaId)
  if (prec && !podeVenderAbaixoDoMinimo) {
    const liquido = calcLiquidoRecebido(data.pagamentos, prec.taxas)
    if (liquido < prec.valorMinimoPix - 0.01) {
      const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      throw new Error(
        `Valor abaixo do mínimo: líquido estimado ${fmt(liquido)} — mínimo PIX ${fmt(prec.valorMinimoPix)}. Peça aprovação em vez de salvar direto.`
      )
    }
  }

  const podeEscolherVendedor = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const vendedorId = (podeEscolherVendedor && data.vendedorId) ? data.vendedorId : usuario.id

  const dataVendaFinal = data.dataVenda ? new Date(data.dataVenda + 'T12:00:00') : new Date()

  await db.transaction(async (tx) => {
    await criarVendaTx(tx, { moto, data, vendedorId, efetivadoPor: usuario.id, dataVendaFinal })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath('/caixa')

  // Vira o lead do cliente no Kommo pra "Venda Ganha" (best-effort, com timeout).
  const kommo: ResultadoVirarLead = await Promise.race([
    virarLeadKommo(data.clienteCelular, valorNum),
    new Promise<ResultadoVirarLead>(res => setTimeout(() => res({ resultado: 'erro' }), 8000)),
  ]).catch(() => ({ resultado: 'erro' as const }))

  return { kommo }
}

// ─── Confirmar NF de Saída ───────────────────────────────────────────────────

export async function confirmarNFSaidaAction(motoId: string, notaFiscal: string): Promise<{ vendaId: string }> {
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
  return { vendaId: venda.id }
}

// ─── Criar rascunho NF-e no Bling (sem transmitir) ──────────────────────────

export async function criarRascunhoBlingAction(motoId: string): Promise<{ ok: true; blingId: number; url: string } | { ok: false; error: string }> {
  try {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    return { ok: false, error: 'Sem permissão para emitir NF' }
  }

  const [venda] = await db
    .select({
      id: vendas.id,
      lojaId: vendas.lojaId,
      valor: vendas.valor,
      pagamentos: vendas.pagamentos,
      vendedorId: vendas.vendedorId,
      blingNfeId: vendas.blingNfeId,
      clienteNome: vendas.clienteNome,
      clienteCpf: vendas.clienteCpf,
      clienteCelular: vendas.clienteCelular,
      clienteEmail: vendas.clienteEmail,
      clienteCep: vendas.clienteCep,
      clienteLogradouro: vendas.clienteLogradouro,
      clienteNumero: vendas.clienteNumero,
      clienteComplemento: vendas.clienteComplemento,
      clienteBairro: vendas.clienteBairro,
      clienteCidade: vendas.clienteCidade,
      clienteEstado: vendas.clienteEstado,
    })
    .from(vendas)
    .where(and(eq(vendas.motoId, motoId), isNull(vendas.notaFiscalSaida)))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  if (!venda) return { ok: false, error: 'Nenhuma venda pendente de NF encontrada' }

  // Rascunho já criado — retorna URL sem criar novo
  if (venda.blingNfeId) {
    return {
      ok: true,
      blingId: Number(venda.blingNfeId),
      url: `https://www.bling.com.br/notas.fiscais.php#edit/${venda.blingNfeId}`,
    }
  }

  const [motoRow] = await db
    .select({ chassi: motos.chassi, modeloId: motos.modeloId, cor: motos.cor, motor: motos.motor })
    .from(motos)
    .where(eq(motos.id, motoId))
    .limit(1)

  if (!motoRow) return { ok: false, error: 'Moto não encontrada' }

  const grupoId = await getGrupoIdDaLoja(venda.lojaId)

  const [modelo] = await db
    .select({
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
      tipoMotor: modelos.motor,
    })
    .from(modelos)
    .where(eq(modelos.id, motoRow.modeloId))
    .limit(1)

  if (!modelo) return { ok: false, error: 'Modelo não encontrado' }

  const [codigoRow] = await db
    .select({ codigo: modeloBlingCodigos.codigo })
    .from(modeloBlingCodigos)
    .where(and(eq(modeloBlingCodigos.modeloId, motoRow.modeloId), eq(modeloBlingCodigos.grupoId, grupoId)))
    .limit(1)

  if (!codigoRow?.codigo) {
    return { ok: false, error: `Código Bling não configurado para "${modelo.marca} ${modelo.modelo}" neste grupo. Configure em Admin → Modelos.` }
  }

  const [vendedorRow] = await db
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, venda.vendedorId))
    .limit(1)

  const { criarRascunhoNFe } = await import('@/lib/bling')
  const pagamentos = (venda.pagamentos as { tipo: string; valor: number; parcelas?: number }[]) ?? []

  const resultado = await criarRascunhoNFe(grupoId, {
    clienteNome: venda.clienteNome,
    clienteCpf: venda.clienteCpf,
    clienteCelular: venda.clienteCelular,
    clienteEmail: venda.clienteEmail,
    clienteCep: venda.clienteCep,
    clienteLogradouro: venda.clienteLogradouro,
    clienteNumero: venda.clienteNumero,
    clienteComplemento: venda.clienteComplemento,
    clienteBairro: venda.clienteBairro,
    clienteCidade: venda.clienteCidade,
    clienteEstado: venda.clienteEstado,
    valor: venda.valor,
    pagamentos,
    blingCodigo: codigoRow.codigo,
    descricaoProduto: `${modelo.marca} ${modelo.modelo}`,
    chassi: motoRow.chassi,
    marca: modelo.marca,
    modeloNome: modelo.modelo,
    cor: motoRow.cor,
    motor: motoRow.motor,
    tipoMotor: modelo.tipoMotor,
    categoria: modelo.categoria,
    potencia: modelo.potenciaW,
    vendedorNome: vendedorRow?.nome ?? 'N/I',
  })

  await db.update(vendas)
    .set({ blingNfeId: String(resultado.blingId) })
    .where(eq(vendas.id, venda.id))

  return { ok: true, ...resultado }
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'Erro ao criar rascunho no Bling' }
  }
}

// ─── Atualizar rascunho NF-e existente no Bling ─────────────────────────────

export async function atualizarRascunhoBlingAction(motoId: string): Promise<{ ok: true; blingId: number; url: string } | { ok: false; error: string }> {
  try {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    return { ok: false, error: 'Sem permissão para emitir NF' }
  }

  const [venda] = await db
    .select({
      id: vendas.id,
      lojaId: vendas.lojaId,
      valor: vendas.valor,
      pagamentos: vendas.pagamentos,
      vendedorId: vendas.vendedorId,
      blingNfeId: vendas.blingNfeId,
      clienteNome: vendas.clienteNome,
      clienteCpf: vendas.clienteCpf,
      clienteCelular: vendas.clienteCelular,
      clienteEmail: vendas.clienteEmail,
      clienteCep: vendas.clienteCep,
      clienteLogradouro: vendas.clienteLogradouro,
      clienteNumero: vendas.clienteNumero,
      clienteComplemento: vendas.clienteComplemento,
      clienteBairro: vendas.clienteBairro,
      clienteCidade: vendas.clienteCidade,
      clienteEstado: vendas.clienteEstado,
    })
    .from(vendas)
    .where(and(eq(vendas.motoId, motoId), isNull(vendas.notaFiscalSaida)))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  if (!venda) return { ok: false, error: 'Nenhuma venda pendente de NF encontrada' }
  if (!venda.blingNfeId) return { ok: false, error: 'Nenhum rascunho Bling encontrado para esta venda' }

  const [motoRow] = await db
    .select({ chassi: motos.chassi, modeloId: motos.modeloId, cor: motos.cor, motor: motos.motor })
    .from(motos)
    .where(eq(motos.id, motoId))
    .limit(1)

  if (!motoRow) return { ok: false, error: 'Moto não encontrada' }

  const grupoId = await getGrupoIdDaLoja(venda.lojaId)

  const [modelo] = await db
    .select({
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
      tipoMotor: modelos.motor,
    })
    .from(modelos)
    .where(eq(modelos.id, motoRow.modeloId))
    .limit(1)

  if (!modelo) return { ok: false, error: 'Modelo não encontrado' }

  const [codigoRow] = await db
    .select({ codigo: modeloBlingCodigos.codigo })
    .from(modeloBlingCodigos)
    .where(and(eq(modeloBlingCodigos.modeloId, motoRow.modeloId), eq(modeloBlingCodigos.grupoId, grupoId)))
    .limit(1)

  if (!codigoRow?.codigo) return { ok: false, error: 'Código Bling não encontrado para este modelo neste grupo' }

  const [vendedorRow] = await db
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, venda.vendedorId))
    .limit(1)

  const { atualizarRascunhoNFe } = await import('@/lib/bling')
  const pagamentos = (venda.pagamentos as { tipo: string; valor: number; parcelas?: number }[]) ?? []

  const resultado = await atualizarRascunhoNFe(grupoId, Number(venda.blingNfeId), {
    clienteNome: venda.clienteNome,
    clienteCpf: venda.clienteCpf,
    clienteCelular: venda.clienteCelular,
    clienteEmail: venda.clienteEmail,
    clienteCep: venda.clienteCep,
    clienteLogradouro: venda.clienteLogradouro,
    clienteNumero: venda.clienteNumero,
    clienteComplemento: venda.clienteComplemento,
    clienteBairro: venda.clienteBairro,
    clienteCidade: venda.clienteCidade,
    clienteEstado: venda.clienteEstado,
    valor: venda.valor,
    pagamentos,
    blingCodigo: codigoRow.codigo,
    descricaoProduto: `${modelo.marca} ${modelo.modelo}`,
    chassi: motoRow.chassi,
    marca: modelo.marca,
    modeloNome: modelo.modelo,
    cor: motoRow.cor,
    motor: motoRow.motor,
    tipoMotor: modelo.tipoMotor,
    categoria: modelo.categoria,
    potencia: modelo.potenciaW,
    vendedorNome: vendedorRow?.nome ?? 'N/I',
  })
  return { ok: true, ...resultado }
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'Erro ao atualizar rascunho no Bling' }
  }
}

// ─── Emitir NF-e no Bling ───────────────────────────────────────────────────

export async function emitirNFBlingAction(motoId: string): Promise<void> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para emitir NF')
  }

  const [venda] = await db
    .select({
      id: vendas.id,
      lojaId: vendas.lojaId,
      valor: vendas.valor,
      formaPagamento: vendas.formaPagamento,
      pagamentos: vendas.pagamentos,
      vendedorId: vendas.vendedorId,
      clienteNome: vendas.clienteNome,
      clienteCpf: vendas.clienteCpf,
      clienteCelular: vendas.clienteCelular,
      clienteEmail: vendas.clienteEmail,
      clienteCep: vendas.clienteCep,
      clienteLogradouro: vendas.clienteLogradouro,
      clienteNumero: vendas.clienteNumero,
      clienteComplemento: vendas.clienteComplemento,
      clienteBairro: vendas.clienteBairro,
      clienteCidade: vendas.clienteCidade,
      clienteEstado: vendas.clienteEstado,
    })
    .from(vendas)
    .where(and(eq(vendas.motoId, motoId), isNull(vendas.notaFiscalSaida)))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  if (!venda) throw new Error('Nenhuma venda pendente de NF encontrada')

  const [motoRow] = await db
    .select({ chassi: motos.chassi, modeloId: motos.modeloId, cor: motos.cor, motor: motos.motor })
    .from(motos)
    .where(eq(motos.id, motoId))
    .limit(1)

  if (!motoRow) throw new Error('Moto não encontrada')

  const grupoId = await getGrupoIdDaLoja(venda.lojaId)

  const [modelo] = await db
    .select({
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
      tipoMotor: modelos.motor,
    })
    .from(modelos)
    .where(eq(modelos.id, motoRow.modeloId))
    .limit(1)

  if (!modelo) throw new Error('Modelo não encontrado')

  const [codigoRow] = await db
    .select({ codigo: modeloBlingCodigos.codigo })
    .from(modeloBlingCodigos)
    .where(and(eq(modeloBlingCodigos.modeloId, motoRow.modeloId), eq(modeloBlingCodigos.grupoId, grupoId)))
    .limit(1)

  if (!codigoRow?.codigo) {
    throw new Error(`Código Bling não configurado para "${modelo.marca} ${modelo.modelo}" neste grupo. Configure em Admin → Modelos.`)
  }

  const [vendedorRow] = await db
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, venda.vendedorId))
    .limit(1)

  const { emitirNFe } = await import('@/lib/bling')
  const pagamentos = (venda.pagamentos as { tipo: string; valor: number; parcelas?: number }[]) ?? []

  const numeroNF = await emitirNFe(grupoId, {
    clienteNome: venda.clienteNome,
    clienteCpf: venda.clienteCpf,
    clienteCelular: venda.clienteCelular,
    clienteEmail: venda.clienteEmail,
    clienteCep: venda.clienteCep,
    clienteLogradouro: venda.clienteLogradouro,
    clienteNumero: venda.clienteNumero,
    clienteComplemento: venda.clienteComplemento,
    clienteBairro: venda.clienteBairro,
    clienteCidade: venda.clienteCidade,
    clienteEstado: venda.clienteEstado,
    valor: venda.valor,
    pagamentos,
    blingCodigo: codigoRow.codigo,
    descricaoProduto: `${modelo.marca} ${modelo.modelo}`,
    chassi: motoRow.chassi,
    marca: modelo.marca,
    modeloNome: modelo.modelo,
    cor: motoRow.cor,
    motor: motoRow.motor,
    tipoMotor: modelo.tipoMotor,
    categoria: modelo.categoria,
    potencia: modelo.potenciaW,
    vendedorNome: vendedorRow?.nome ?? 'N/I',
  })

  await db.transaction(async (tx) => {
    await tx.update(vendas)
      .set({ notaFiscalSaida: numeroNF })
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
  demandaVinculadaId?: string | null
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
  if (moto.disponibilidade === 'aguardando_aprovacao') {
    throw new Error('Moto tem uma venda aguardando aprovação — aprove ou recuse antes de reservar')
  }

  const valorNum = parseFloat(data.valorReserva)
  if (isNaN(valorNum) || valorNum <= 0) throw new Error('Valor de reserva inválido')

  const prec = await buscarPrecificacao(moto.modeloId, moto.lojaId)
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

  let reservaId = ''

  await db.transaction(async (tx) => {
    const valorTotalNum = parseFloat(data.valorTotalVenda)

    const dataReservaFinal = data.dataReserva ? new Date(data.dataReserva + 'T12:00:00') : new Date()
    const [novaReserva] = await tx.insert(reservas).values({
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
    }).returning({ id: reservas.id })
    reservaId = novaReserva.id

    await tx.update(motos)
      .set({ disponibilidade: 'reservada' })
      .where(eq(motos.id, data.motoId))

    // Vincular demanda (fluxo "vincular a demanda existente") → marca como atendida.
    // Restringe à loja da moto e a demandas abertas — evita IDOR/corrida.
    if (data.demandaVinculadaId) {
      await tx.update(demandas)
        .set({ status: 'atendida' })
        .where(and(
          eq(demandas.id, data.demandaVinculadaId),
          eq(demandas.status, 'aberta'),
          eq(demandas.lojaId, moto.lojaId),
        ))
    }

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
  return { id: reservaId }
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

// ─── Buscar cliente por CPF ──────────────────────────────────────────────────

export async function buscarClientePorCpfAction(cpf: string) {
  await getUsuarioLogado()
  const cpfLimpo = cpf.replace(/\D/g, '')
  if (cpfLimpo.length !== 11) return null

  // 1. Busca na tabela de clientes
  const [cliente] = await db
    .select({
      nome: clientes.nome,
      celular: clientes.celular,
      email: clientes.email,
      cep: clientes.cep,
      logradouro: clientes.endereco,
      numero: clientes.numero,
      complemento: clientes.complemento,
      bairro: clientes.bairro,
      cidade: clientes.cidade,
      estado: clientes.uf,
    })
    .from(clientes)
    .where(eq(clientes.cpfCnpj, cpfLimpo))
    .limit(1)

  if (cliente) return { source: 'clientes' as const, ...cliente }

  // 2. Fallback: última venda com esse CPF
  const [venda] = await db
    .select({
      nome: vendas.clienteNome,
      celular: vendas.clienteCelular,
      email: vendas.clienteEmail,
      cep: vendas.clienteCep,
      logradouro: vendas.clienteLogradouro,
      numero: vendas.clienteNumero,
      complemento: vendas.clienteComplemento,
      bairro: vendas.clienteBairro,
      cidade: vendas.clienteCidade,
      estado: vendas.clienteEstado,
    })
    .from(vendas)
    .where(eq(vendas.clienteCpf, cpf))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  if (venda) return { source: 'vendas' as const, ...venda }

  return null
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

// ─── Baixar DANFE da NF-e autorizada ─────────────────────────────────────────

export async function buscarDanfeAction(motoId: string): Promise<{ linkDanfe: string | null; linkPDF: string | null }> {
  await getUsuarioLogado()

  const [venda] = await db
    .select({ blingNfeId: vendas.blingNfeId, lojaId: vendas.lojaId })
    .from(vendas)
    .where(and(eq(vendas.motoId, motoId)))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  if (!venda?.blingNfeId) throw new Error('ID da NF-e não encontrado. Verifique se o rascunho foi criado pelo MOVA.')

  const { buscarLinksDanfe } = await import('@/lib/bling')
  const grupoId = await getGrupoIdDaLoja(venda.lojaId)
  const links = await buscarLinksDanfe(grupoId, venda.blingNfeId)

  if (!links.linkDanfe && !links.linkPDF) throw new Error('DANFE não disponível. A NF-e ainda não foi autorizada no Bling.')

  return links
}

// ─── Aprovação de venda abaixo do valor mínimo ────────────────────────────────

export async function solicitarAprovacaoVendaAction(
  data: DadosVendaCompleta,
  motivo: string,
  tipoAprovacao: 'valor_minimo' | 'pagamento_sensivel' = 'valor_minimo',
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para registrar venda')
  }

  const [moto] = await db.select().from(motos).where(eq(motos.id, data.motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')
  if (moto.status === 'caixa') throw new Error('Moto ainda não foi montada — não pode ser vendida')
  if (moto.status === 'vendida') throw new Error('Moto já foi vendida')
  if (moto.disponibilidade === 'aguardando_aprovacao') throw new Error('Esta moto já tem uma venda aguardando aprovação')
  if (moto.disponibilidade === 'reservada') throw new Error('Moto está reservada — finalize ou cancele a reserva antes')

  const valorNum = parseFloat(data.valorTotal)
  if (isNaN(valorNum) || valorNum <= 0) throw new Error('Valor inválido')

  const soma = data.pagamentos.reduce((a, p) => a + p.valor, 0)
  if (Math.abs(soma - valorNum) > 0.01) {
    throw new Error('Somatório das formas de pagamento difere do valor da venda')
  }

  let motivoFinal: string
  if (tipoAprovacao === 'pagamento_sensivel') {
    if (!temPagamentoSensivel(data.pagamentos)) {
      throw new Error('Nenhum pagamento por financiamento ou transferência nesta venda')
    }
    const tiposUsados = data.pagamentos
      .filter(p => TIPOS_PAGAMENTO_SENSIVEL.has(p.tipo))
      .map(p => p.tipo === 'financiamento' ? 'Financiamento' : 'Transferência Bancária')
    motivoFinal = motivo.trim() || `Pagamento via ${[...new Set(tiposUsados)].join(' + ')}`
  } else {
    if (!motivo.trim()) throw new Error('Informe o motivo do pedido de aprovação')
    const prec = await buscarPrecificacao(moto.modeloId, moto.lojaId)
    if (!prec) throw new Error('Sem preço mínimo configurado para este modelo — use o fluxo normal de venda')
    const liquido = calcLiquidoRecebido(data.pagamentos, prec.taxas)
    if (liquido >= prec.valorMinimoPix - 0.01) {
      throw new Error('Valor está dentro do mínimo — use o fluxo normal de venda')
    }
    motivoFinal = motivo.trim()
  }

  const podeEscolherVendedor = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const vendedorId = (podeEscolherVendedor && data.vendedorId) ? data.vendedorId : usuario.id

  await db.transaction(async (tx) => {
    await tx.insert(aprovacoesVenda).values({
      motoId: moto.id,
      lojaId: moto.lojaId,
      vendedorId,
      valor: data.valorTotal,
      dadosVenda: data,
      motivo: motivoFinal,
      tipo: tipoAprovacao,
      disponibilidadeAnterior: moto.disponibilidade,
      status: 'pendente',
    })

    await tx.update(motos)
      .set({ disponibilidade: 'aguardando_aprovacao' })
      .where(eq(motos.id, moto.id))

    await tx.insert(historicoEstoque).values({
      motoId: moto.id,
      lojaOrigemId: moto.lojaId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      referenciaTipo: 'aprovacao_venda',
      observacao: `Pedido de aprovação — Cliente: ${data.clienteNome} — Valor: R$ ${valorNum.toFixed(2)} — Motivo: ${motivoFinal}`,
    })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath(`/estoque/${data.motoId}`)
}

export async function aprovarVendaAction(aprovacaoId: string) {
  const usuario = await getUsuarioLogado()

  const [aprovacao] = await db.select().from(aprovacoesVenda).where(eq(aprovacoesVenda.id, aprovacaoId)).limit(1)
  if (!aprovacao) throw new Error('Solicitação não encontrada')
  if (aprovacao.status !== 'pendente') throw new Error(`Solicitação não está pendente (status: ${aprovacao.status})`)

  const podeResponder = aprovacao.tipo === 'pagamento_sensivel'
    ? podeAprovarPagamentoSensivel(usuario)
    : await podeAprovarVendaBaixoValor(usuario, aprovacao.lojaId)
  if (!podeResponder) {
    throw new Error('Sem permissão para aprovar esta venda')
  }

  // OS: a linha já existe (aberta antes do pagamento) — só aplica o pagamento retido.
  if (aprovacao.origem === 'os') {
    if (!aprovacao.osId) throw new Error('Aprovação de OS sem os_id')
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(aprovacoesVenda)
        .set({ status: 'aprovada', respondidoPor: usuario.id, dataResposta: new Date() })
        .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
        .returning({ id: aprovacoesVenda.id })
      if (!claimed) throw new Error('Solicitação não está mais pendente')
    })
    await aplicarPagamentoOS(aprovacao.osId, aprovacao.dadosVenda as unknown as DadosPagamentoOS)
    revalidatePath('/vendas')
    return
  }

  // Peça: a venda ainda não existe — cria de fato, atômico com o UPDATE de aprovação.
  if (aprovacao.origem === 'peca') {
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(aprovacoesVenda)
        .set({ status: 'aprovada', respondidoPor: usuario.id, dataResposta: new Date() })
        .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
        .returning({ id: aprovacoesVenda.id })
      if (!claimed) throw new Error('Solicitação não está mais pendente')

      await aplicarVendaPeca(tx, aprovacao.vendedorId, aprovacao.dadosVenda as unknown as DadosVendaPeca)
    })
    revalidatePath('/vendas')
    revalidatePath('/pecas')
    return
  }

  // Moto (fluxo original): a venda também não existe ainda.
  if (!aprovacao.motoId) throw new Error('Aprovação de moto sem moto_id')
  const [moto] = await db.select().from(motos).where(eq(motos.id, aprovacao.motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  const data = aprovacao.dadosVenda as unknown as DadosVendaCompleta
  const dataVendaFinal = data.dataVenda ? new Date(data.dataVenda + 'T12:00:00') : new Date()

  await db.transaction(async (tx) => {
    // UPDATE condicionado a status = 'pendente' — evita duplicar a venda se
    // dois aprovadores confirmarem ao mesmo tempo.
    const [claimed] = await tx.update(aprovacoesVenda)
      .set({ status: 'aprovada', respondidoPor: usuario.id, dataResposta: new Date() })
      .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
      .returning({ id: aprovacoesVenda.id })
    if (!claimed) throw new Error('Solicitação não está mais pendente')

    await criarVendaTx(tx, { moto, data, vendedorId: aprovacao.vendedorId, efetivadoPor: usuario.id, dataVendaFinal })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath(`/estoque/${aprovacao.motoId}`)
  revalidatePath('/caixa')
}

export async function recusarVendaAction(aprovacaoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()

  const [aprovacao] = await db.select().from(aprovacoesVenda).where(eq(aprovacoesVenda.id, aprovacaoId)).limit(1)
  if (!aprovacao) throw new Error('Solicitação não encontrada')
  if (aprovacao.status !== 'pendente') throw new Error(`Solicitação não está pendente (status: ${aprovacao.status})`)

  const podeResponder = aprovacao.tipo === 'pagamento_sensivel'
    ? podeAprovarPagamentoSensivel(usuario)
    : await podeAprovarVendaBaixoValor(usuario, aprovacao.lojaId)
  if (!podeResponder) {
    throw new Error('Sem permissão para recusar esta venda')
  }

  // OS/Peça: nada foi criado/reservado ainda (a OS continua como estava, sem pagamento
  // aplicado; a venda de peça nunca chegou a existir) — só marca a solicitação como recusada.
  if (aprovacao.origem !== 'moto') {
    const [claimed] = await db.update(aprovacoesVenda)
      .set({ status: 'recusada', respondidoPor: usuario.id, dataResposta: new Date() })
      .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
      .returning({ id: aprovacoesVenda.id })
    if (!claimed) throw new Error('Solicitação não está mais pendente')

    revalidatePath('/vendas')
    if (aprovacao.origem === 'os')   revalidatePath(`/ordens-servico/${aprovacao.osId}`)
    if (aprovacao.origem === 'peca') revalidatePath('/pecas')
    return
  }

  await db.transaction(async (tx) => {
    // UPDATE condicionado a status = 'pendente' — evita recusar duas vezes
    // (ou recusar depois de já aprovada) se dois aprovadores agirem juntos.
    const [claimed] = await tx.update(aprovacoesVenda)
      .set({ status: 'recusada', respondidoPor: usuario.id, dataResposta: new Date() })
      .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
      .returning({ id: aprovacoesVenda.id })
    if (!claimed) throw new Error('Solicitação não está mais pendente')

    await tx.update(motos)
      .set({ disponibilidade: aprovacao.disponibilidadeAnterior })
      .where(eq(motos.id, aprovacao.motoId!))

    await tx.insert(historicoEstoque).values({
      motoId: aprovacao.motoId!,
      lojaOrigemId: aprovacao.lojaId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      referenciaTipo: 'aprovacao_venda',
      referenciaId: aprovacaoId,
      observacao: observacao?.trim()
        ? `Venda recusada — Motivo: ${observacao.trim()}`
        : 'Venda recusada',
    })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath(`/estoque/${aprovacao.motoId}`)
}


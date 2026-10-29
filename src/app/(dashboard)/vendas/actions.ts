'use server'
import { aplicarEdicaoAprovadaTx, type EdicaoPendente } from '@/lib/editar-venda-peca'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { registrarAcaoSensivelSemFalhar } from '@/lib/log-acoes'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { db } from '@/lib/db'
import { conferirMaquininhas, operadorasGravadas } from '@/lib/maquininhas'
import { motos, modelos, modeloBlingCodigos, pedidosVenda, vendas, reservas, historicoEstoque, lancamentosCaixa, precificacao, configuracaoTaxas, usuarios, clientes, aprovacoesVenda, demandas, conciliacoesCartao, pixRecebimentosMcp, documentosAssinatura, notasFiscaisSaida, nfeBlingArquivo } from '@/lib/db/schema'
import { eq, and, isNull, isNotNull, notInArray, inArray, desc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { calcLiquidoRecebido, validarReserva } from '@/lib/preco-minimo'
import { pagamentosFecham, somaPagamentos, descreverPagamentos, type PagamentoEntrada } from '@/lib/pagamentos-entrada'
import { podeAbrirRegistroDaLoja, podeVenderMotoDaLoja } from '@/lib/acesso-registro'
import { clientesDoEscopo, contaDaLoja, lojasDoEscopo } from '@/lib/conta'
import { conferirComprador, conferirCompradorDaVenda, gravarCompradorDaVenda } from '@/lib/venda-comprador'
import { contaDoGrupoAtivo, getGrupoIdDaLoja, podeAprovarVendaBaixoValor, podeAprovarPagamentoSensivelNaLoja, podeUsuarioVerGrupo } from '@/lib/grupo'
import { aplicarPagamentoOS, type DadosPagamentoOS } from '@/lib/pagamento-os'
import { aplicarVendaPeca, type DadosVendaPeca } from '@/lib/venda-peca'
import { virarLeadKommo, type ResultadoVirarLead } from '@/lib/kommo'
import { notificarVendaWhatsapp, type ResultadoAvisoVenda } from '@/lib/whatsapp/venda'
import { parseDataInput, hojeBrt } from '@/lib/data-venda'
import { motivoBloqueioCancelarReserva, motivoBloqueioPedidoAprovacao } from '@/lib/estado-moto'
import { validarOrigemVenda, normalizarDetalhe } from '@/lib/origem-venda'
import { buscarOrigemParaValidar } from '@/lib/queries/origens-venda'
import { situacaoNfDaVenda } from '@/lib/assinatura/consulta'
import { motivoBloqueioNf } from '@/lib/assinatura/nf'
import { lerContribuinteIcms, tipoPessoaDoDocumento } from '@/lib/documento'
import { STATUS_MORTOS } from '@/lib/notagateway/status'
import { vendaTemNfViva } from '@/lib/notagateway/nf-viva'
import { travaDoCancelamentoDaVendaAction } from './nfe-propria-actions'
import { podeCriarPedido } from '@/lib/pedido-venda-regras'
import { PAPEIS_QUE_CANCELAM_VENDA, travaDoPapel } from '@/lib/cancelar-venda'
import { efetivarPedidoTx } from '@/lib/efetivar-pedido'
import { cancelarPedidoTx, criarPedidoTx } from '@/lib/pedido-venda'
import { travaDoValorVenda } from '@/lib/valor-venda'
import { acao, RecusaUsuario } from '@/lib/resultado-action'
import { pedidoDoUsuario } from '@/lib/pedido-do-usuario'
import { motoDoUsuario } from '@/lib/moto-do-usuario'
import { aprovacaoDoUsuario } from '@/lib/aprovacao-do-usuario'
import { vendedorDaConta } from '@/lib/vendedor-da-conta'
import { reservaDoUsuario } from '@/lib/reserva-do-usuario'
import { vendaDoUsuario } from '@/lib/venda-do-usuario'

// Financiamento saiu daqui em 01/09/2026: a venda financiada não espera mais
// aprovação para ser lançada. O controle virou conferência DEPOIS, na conciliação
// — o financiamento nasce pendente e só o admin_geral confirma que caiu na conta.
// Ver precisaConciliar em @/lib/conciliacao-status.
const TIPOS_PAGAMENTO_SENSIVEL = new Set(['transferencia'])
function temPagamentoSensivel(pagamentos: { tipo: string }[]): boolean {
  return pagamentos.some(p => TIPOS_PAGAMENTO_SENSIVEL.has(p.tipo))
}

/**
 * Confere a origem contra o grupo da loja da MOTO e devolve o detalhe já limpo.
 *
 * Chamada pelos três caminhos que criam venda (direta, aprovada e pedido
 * efetivado). Valida contra a loja da moto, não contra o grupo ativo do
 * usuário: é o que impede um payload forjado gravar venda de BH com origem do
 * Sul de Minas.
 */
async function garantirOrigemValida(
  lojaIdDaMoto: string,
  origemId: string | null | undefined,
  origemDetalhe: string | null | undefined,
): Promise<{ origemId: string; origemDetalhe: string | null }> {
  const [grupoId, origem] = await Promise.all([
    getGrupoIdDaLoja(lojaIdDaMoto),
    buscarOrigemParaValidar(origemId),
  ])
  const resultado = validarOrigemVenda(origem, origemDetalhe, grupoId)
  if (!resultado.ok) throw new RecusaUsuario(resultado.erro)
  return {
    origemId: origem!.id,
    origemDetalhe: normalizarDetalhe(origemDetalhe, origem!.pedeDetalhe),
  }
}

function comCompradorConferido(data: DadosVendaCompleta): DadosVendaCompleta {
  const comprador = conferirComprador(data.clienteCpf, { nome: data.representanteNome, cpf: data.representanteCpf })
  const icms = lerContribuinteIcms(comprador.clienteCpf, data.clienteIndicadorIe, data.clienteInscricaoEstadual)
  return {
    ...data,
    clienteCpf: comprador.clienteCpf,
    representanteNome: comprador.representanteNome,
    representanteCpf: comprador.representanteCpf,
    clienteIndicadorIe: icms.indicadorIe,
    clienteInscricaoEstadual: icms.inscricaoEstadual,
  }
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
  const usuario = await getUsuarioLogado()
  const [moto] = await db.select({ modeloId: motos.modeloId, lojaId: motos.lojaId }).from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto || !(await podeVenderMotoDaLoja(usuario, moto.lojaId))) return null
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

export async function criarPedidoVendaAction(...a: Parameters<typeof criarPedidoVenda>) {
  return acao(() => criarPedidoVenda(...a))
}

async function criarPedidoVenda(motoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  if (!podeCriarPedido(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão para criar pedido de venda')
  }

  if (!(await motoDoUsuario(usuario, motoId))) throw new RecusaUsuario('Moto não encontrada')

  await db.transaction(tx => criarPedidoTx(tx, {
    motoId,
    vendedorId: usuario.id,
    observacao: observacao?.trim() || null,
  }))

  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

export async function cancelarPedidoAction(...a: Parameters<typeof cancelarPedido>) {
  return acao(() => cancelarPedido(...a))
}

async function cancelarPedido(pedidoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()

  if (!(await pedidoDoUsuario(usuario, pedidoId))) throw new RecusaUsuario('Pedido não encontrado')

  await db.transaction(tx => cancelarPedidoTx(tx, {
    pedidoId,
    usuario: { id: usuario.id, papel: usuario.papel, lojaId: usuario.lojaId ?? null },
    observacao: observacao?.trim() || null,
  }))
  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

export async function efetivarVendaAction(...a: Parameters<typeof efetivarVenda>) {
  return acao(() => efetivarVenda(...a))
}

async function efetivarVenda(
  pedidoId: string,
  clienteNome: string,
  clienteCpf: string,
  valor: string,
  formaPagamento: string,
  clienteId?: string,
  origemId?: string,
  origemDetalhe?: string,
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão para efetivar venda')
  }

  // A loja sai do pedido, não do usuário: é a loja da moto que define de qual
  // grupo a origem tem de ser — e em qual grupo a aprovação é avaliada.
  const pedido = await pedidoDoUsuario(usuario, pedidoId)
  if (!pedido) throw new RecusaUsuario('Pedido não encontrado')

  const valorNum = parseFloat(valor)
  if (isNaN(valorNum) || valorNum <= 0) throw new RecusaUsuario('Valor inválido')

  if (TIPOS_PAGAMENTO_SENSIVEL.has(formaPagamento) && !(await podeAprovarPagamentoSensivelNaLoja(usuario, pedido.lojaId))) {
    throw new RecusaUsuario('Venda com financiamento ou transferência bancária precisa de aprovação. Use o fluxo de venda pela ficha da moto (Vender) para pedir aprovação.')
  }

  const origem = await garantirOrigemValida(pedido.lojaId, origemId, origemDetalhe)
  const comprador = conferirComprador(clienteCpf)

  // Pelo Drizzle, não pela sessão: a RLS de escrita em vendas só aceita
  // admin_geral, e o vínculo do cliente sumia calado para sócio e aux_adm (#181).
  await db.transaction(tx => efetivarPedidoTx(tx, {
    pedidoId,
    lojaId: pedido.lojaId,
    efetivadoPor: usuario.id,
    clienteId: clienteId || null,
    clienteNome,
    clienteCpf: comprador.clienteCpf,
    valor: valorNum,
    formaPagamento,
    origem,
  }))
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
  /** Só na venda para pessoa jurídica; opcionais. */
  representanteNome?: string | null
  representanteCpf?: string | null
  /** Contribuinte de ICMS do comprador CNPJ ('contribuinte' | 'isento' | 'nao_contribuinte'). */
  clienteIndicadorIe?: string | null
  clienteInscricaoEstadual?: string | null
  valorTotal: string
  dataVenda?: string
  pagamentos: { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }[]
  /** Por onde o cliente chegou. Obrigatório — viaja no dados_venda da aprovação. */
  origemId: string
  origemDetalhe?: string
}

async function criarVendaTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    moto: { id: string; lojaId: string }
    data: DadosVendaCompleta
    vendedorId: string
    efetivadoPor: string
    dataVendaFinal: Date
    /** Já validada pela action com garantirOrigemValida. */
    origem: { origemId: string; origemDetalhe: string | null }
  }
): Promise<{ vendaId: string }> {
  const { moto, data, vendedorId, efetivadoPor, dataVendaFinal, origem } = params
  // Aqui, e não só na action: a aprovação guardada chega direto (#460).
  await conferirMaquininhas(tx, moto.lojaId, data.pagamentos)
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

  // Pedido de aprovação gravado antes da IE chega sem os campos: vira não contribuinte.
  const icms = lerContribuinteIcms(data.clienteCpf, data.clienteIndicadorIe, data.clienteInscricaoEstadual)

  // Upsert cliente por CPF/CNPJ — cria se não existir, atualiza se existir
  const cpfLimpo = data.clienteCpf.replace(/\D/g, '')
  let clienteVinculadoId: string | null = null
  if (cpfLimpo.length >= 11) {
    const [clienteUpsert] = await tx
      .insert(clientes)
      .values({
        contaId:     await contaDaLoja(moto.lojaId, tx),
        nome:        data.clienteNome.trim(),
        cpfCnpj:     cpfLimpo,
        tipoPessoa:  tipoPessoaDoDocumento(cpfLimpo),
        email:       data.clienteEmail        || null,
        celular:     data.clienteCelular       || null,
        endereco:    data.clienteLogradouro    || null,
        numero:      data.clienteNumero        || null,
        complemento: data.clienteComplemento   || null,
        bairro:      data.clienteBairro        || null,
        cep:         data.clienteCep           || null,
        cidade:      data.clienteCidade        || null,
        uf:          data.clienteEstado        || null,
        indicadorIe:       icms.indicadorIe,
        inscricaoEstadual: icms.inscricaoEstadual,
      })
      .onConflictDoUpdate({
        target: [clientes.contaId, clientes.cpfCnpj],
        set: {
          nome:        sql`excluded.nome`,
          tipoPessoa:  sql`excluded.tipo_pessoa`,
          email:       sql`excluded.email`,
          celular:     sql`excluded.celular`,
          endereco:    sql`excluded.endereco`,
          numero:      sql`excluded.numero`,
          complemento: sql`excluded.complemento`,
          bairro:      sql`excluded.bairro`,
          cep:         sql`excluded.cep`,
          cidade:      sql`excluded.cidade`,
          uf:          sql`excluded.uf`,
          // "Não contribuinte" é também o padrão da tela e do pedido de aprovação
          // antigo: não apaga a IE de um cadastro que já a tem. Rebaixar é pela edição.
          ...(icms.indicadorIe === 'contribuinte' || icms.indicadorIe === 'isento' ? {
            indicadorIe:       sql`excluded.indicador_ie`,
            inscricaoEstadual: sql`excluded.inscricao_estadual`,
          } : {}),
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
    representanteNome: data.representanteNome ?? null,
    representanteCpf: data.representanteCpf ?? null,
    clienteIndicadorIe: icms.indicadorIe,
    clienteInscricaoEstadual: icms.inscricaoEstadual,
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
    origemId: origem.origemId,
    origemDetalhe: origem.origemDetalhe,
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

export async function registrarVendaCompletaAction(...a: Parameters<typeof registrarVendaCompleta>) {
  return acao(() => registrarVendaCompleta(...a))
}

async function registrarVendaCompleta(data: DadosVendaCompleta) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão para registrar venda')
  }
  data = comCompradorConferido(data)

  const moto = await motoDoUsuario(usuario, data.motoId)
  if (!moto) throw new RecusaUsuario('Moto não encontrada')
  if (moto.status === 'caixa') {
    throw new RecusaUsuario('Moto ainda não foi montada. Não pode ser vendida.')
  }
  if (moto.status === 'vendida') {
    throw new RecusaUsuario('Moto já foi vendida')
  }
  if (moto.disponibilidade === 'aguardando_aprovacao') {
    throw new RecusaUsuario('Moto tem uma venda aguardando aprovação. Aprove ou recuse antes de vender.')
  }

  const valorNum = parseFloat(data.valorTotal)
  if (isNaN(valorNum) || valorNum <= 0) throw new RecusaUsuario('Valor inválido')

  const soma = data.pagamentos.reduce((a, p) => a + p.valor, 0)
  if (Math.abs(soma - valorNum) > 0.01) {
    throw new RecusaUsuario('Somatório das formas de pagamento difere do valor da venda')
  }

  // Transferência bancária sempre precisa da aprovação do responsável,
  // independente de valor ou papel — ver podeAprovarPagamentoSensivelNaLoja.
  if (temPagamentoSensivel(data.pagamentos) && !(await podeAprovarPagamentoSensivelNaLoja(usuario, moto.lojaId))) {
    throw new RecusaUsuario('Venda com transferência bancária precisa de aprovação. Peça aprovação em vez de salvar direto.')
  }

  // admin_geral/admin_socio podem vender abaixo do mínimo direto (auto-aprovação);
  // os demais papéis devem usar solicitarAprovacaoVendaAction nesse caso.
  const podeVenderAbaixoDoMinimo = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const prec = await buscarPrecificacao(moto.modeloId, moto.lojaId)
  if (prec && !podeVenderAbaixoDoMinimo) {
    const liquido = calcLiquidoRecebido(data.pagamentos, prec.taxas)
    if (liquido < prec.valorMinimoPix - 0.01) {
      const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      throw new RecusaUsuario(
        `Valor abaixo do mínimo: líquido estimado ${fmt(liquido)}, mínimo PIX ${fmt(prec.valorMinimoPix)}. Peça aprovação em vez de salvar direto.`
      )
    }
  }

  const podeEscolherVendedor = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const vendedorId = (podeEscolherVendedor && data.vendedorId) ? data.vendedorId : usuario.id
  if (vendedorId !== usuario.id && !(await vendedorDaConta(vendedorId, moto.lojaId))) {
    throw new RecusaUsuario('Vendedor não encontrado')
  }

  const dataVendaFinal = data.dataVenda ? parseDataInput(data.dataVenda) : new Date()

  const origem = await garantirOrigemValida(moto.lojaId, data.origemId, data.origemDetalhe)

  await db.transaction(async (tx) => {
    await criarVendaTx(tx, { moto, data, vendedorId, efetivadoPor: usuario.id, dataVendaFinal, origem })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath('/caixa')

  // Vira o lead do cliente no Kommo pra "Venda Ganha" (best-effort, com timeout).
  const kommo: ResultadoVirarLead = await Promise.race([
    virarLeadKommo(data.clienteCelular, valorNum),
    new Promise<ResultadoVirarLead>(res => setTimeout(() => res({ resultado: 'erro' }), 8000)),
  ]).catch(() => ({ resultado: 'erro' as const }))

  await avisarVendaNoWhatsapp({
    lojaId: moto.lojaId, modeloId: moto.modeloId, vendedorId, valor: valorNum,
  })

  return { kommo }
}

/**
 * Aviso de venda no WhatsApp — best-effort com timeout, igual ao virarLeadKommo:
 * WhatsApp fora do ar não pode fazer a venda falhar depois de já estar gravada.
 */
async function avisarVendaNoWhatsapp(params: {
  lojaId: string; modeloId: string; vendedorId: string; valor: number
}): Promise<void> {
  await Promise.race([
    notificarVendaWhatsapp(params),
    new Promise<ResultadoAvisoVenda>(res => setTimeout(() => res('erro'), 8000)),
  ]).catch(() => 'erro' as const)
}

// ─── Confirmar NF de Saída ───────────────────────────────────────────────────

export async function confirmarNFSaidaAction(...a: Parameters<typeof confirmarNFSaida>) {
  return acao(() => confirmarNFSaida(...a))
}

async function confirmarNFSaida(motoId: string, notaFiscal: string): Promise<{ vendaId: string }> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão para confirmar NF de saída')
  }

  const venda = await vendaDoUsuario(usuario, and(eq(vendas.motoId, motoId), isNull(vendas.notaFiscalSaida))!)
  if (!venda) throw new RecusaUsuario('Nenhuma venda pendente de NF encontrada para esta moto')

  // Trava: sem contrato assinado não registra NF — nem pelo caminho "nota já
  // emitida", senão bastaria emitir direto no Bling e voltar aqui.
  const bloqueio = motivoBloqueioNf(await situacaoNfDaVenda(venda.id))
  if (bloqueio) throw new RecusaUsuario(bloqueio)

  await db.transaction(async (tx) => {
    await tx.update(vendas)
      .set({ notaFiscalSaida: notaFiscal })
      .where(eq(vendas.id, venda.id))

    await tx.update(motos)
      .set({ disponibilidade: 'vendida' as any })
      .where(eq(motos.id, motoId))
  })
  // Nota emitida fora do MOVA e só anotada aqui: entra no log como emissão.
  await registrarAcaoSensivelSemFalhar({
    tipo: 'nf_emitida', usuarioId: usuario.id, lojaId: venda.lojaId,
    detalhe: { origem: 'confirmada', vendaId: venda.id, numeroNf: notaFiscal },
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

  if (!venda || !(await podeAbrirRegistroDaLoja(usuario, venda.lojaId))) return { ok: false, error: 'Nenhuma venda pendente de NF encontrada' }

  // Trava: sem contrato assinado, nem rascunho no Bling.
  const bloqueioNf = motivoBloqueioNf(await situacaoNfDaVenda(venda.id))
  if (bloqueioNf) return { ok: false, error: bloqueioNf }

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

  if (!venda || !(await podeAbrirRegistroDaLoja(usuario, venda.lojaId))) return { ok: false, error: 'Nenhuma venda pendente de NF encontrada' }
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

export async function emitirNFBlingAction(...a: Parameters<typeof emitirNFBling>) {
  return acao(() => emitirNFBling(...a))
}

async function emitirNFBling(motoId: string): Promise<void> {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão para emitir NF')
  }

  const venda = await vendaDoUsuario(usuario, and(eq(vendas.motoId, motoId), isNull(vendas.notaFiscalSaida))!)
  if (!venda) throw new RecusaUsuario('Nenhuma venda pendente de NF encontrada')

  const [motoRow] = await db
    .select({ chassi: motos.chassi, modeloId: motos.modeloId, cor: motos.cor, motor: motos.motor })
    .from(motos)
    .where(eq(motos.id, motoId))
    .limit(1)

  if (!motoRow) throw new RecusaUsuario('Moto não encontrada')

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

  if (!modelo) throw new RecusaUsuario('Modelo não encontrado')

  const [codigoRow] = await db
    .select({ codigo: modeloBlingCodigos.codigo })
    .from(modeloBlingCodigos)
    .where(and(eq(modeloBlingCodigos.modeloId, motoRow.modeloId), eq(modeloBlingCodigos.grupoId, grupoId)))
    .limit(1)

  if (!codigoRow?.codigo) {
    throw new RecusaUsuario(`Código Bling não configurado para "${modelo.marca} ${modelo.modelo}" neste grupo. Configure em Admin → Modelos.`)
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
  await registrarAcaoSensivelSemFalhar({
    tipo: 'nf_emitida', usuarioId: usuario.id, grupoId,
    detalhe: { origem: 'bling', vendaId: venda.id, numeroNf: numeroNF },
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

// ─── Cancelar Venda ─────────────────────────────────────────────────────────

export async function cancelarVendaCompletaAction(vendaId: string, motivo: string) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_QUE_CANCELAM_VENDA.has(usuario.papel)) {
    return { ok: false as const, error: 'Apenas administradores, sócios e auxiliares administrativos podem cancelar vendas' }
  }

  if (!motivo.trim()) {
    return { ok: false as const, error: 'Informe o motivo do cancelamento' }
  }

  const vendaRecord = await vendaDoUsuario(usuario, eq(vendas.id, vendaId))
  if (!vendaRecord) return { ok: false as const, error: 'Venda não encontrada' }
  // O aux_adm cancela só venda da própria loja; sócio e admin, no grupo que veem (decisão do Luis, #404).
  if (usuario.papel === 'aux_adm' && vendaRecord.lojaId !== usuario.lojaId) {
    return { ok: false as const, error: 'Sem permissão para cancelar venda de outra loja' }
  }

  // ADR-0014. A recusa volta como valor porque, em produção, o Next não leva ao
  // cliente a mensagem de um erro lançado na action.
  const t = await travaDoCancelamentoDaVendaAction(vendaId)
  if (!t.ok) return { ok: false as const, error: t.error }
  if (t.trava) return { ok: false as const, error: t.trava, travada: true }

  // Cancelar apaga a linha da venda, e conciliacoes_cartao, pix_recebimentos,
  // pix_recebimentos_mcp e demandas apontam para vendas.id com ON DELETE NO ACTION.
  // Sem soltar esses vínculos primeiro, o DELETE estoura violação de chave
  // estrangeira e o cancelamento inteiro faz rollback — era o que acontecia em
  // qualquer venda que já tivesse recebimento conciliado.
  const desvinculados = { cartao: 0, pix: 0, demandas: 0, valor: 0, documentosAssinados: 0 }
  // Caminhos no bucket, coletados dentro da transação e apagados depois dela.
  const arquivosAssinatura: string[] = []

  const notaVivaNoMeio = await db.transaction(async (tx) => {
    // Uma emissão na mesma hora gravaria a nota e iria à SEFAZ, e o DELETE da
    // venda a deixaria órfã e viva. Com a linha da venda travada, a emissão
    // espera e falha na chave; a que chegou antes aparece na conferência abaixo.
    const [travada] = await tx.select({ notaFiscalSaida: vendas.notaFiscalSaida }).from(vendas).where(eq(vendas.id, vendaId)).for('update')
    // Um "Confirmar NF" entre a conferência e aqui também trava o aux_adm (#191).
    if (travada && travaDoPapel(usuario.papel, travada.notaFiscalSaida)) return true
    if (await vendaTemNfViva(tx, vendaId)) return true

    // Reverter moto para montada/disponível
    await tx.update(motos)
      .set({ status: 'montada', disponibilidade: 'disponivel' })
      .where(eq(motos.id, vendaRecord.motoId))

    // Cancelar o pedido de venda
    await tx.update(pedidosVenda)
      .set({ status: 'cancelado' })
      .where(eq(pedidosVenda.id, vendaRecord.pedidoVendaId))

    // Recebimentos voltam a ficar sem dono, para reaparecerem como não vinculados
    // em /conciliacao e /pix-mcp — o dinheiro entrou e continua no extrato.
    const cartoes = await tx.update(conciliacoesCartao)
      .set({ vendaId: null, conciliado: false, conciliadoEm: null })
      .where(eq(conciliacoesCartao.vendaId, vendaId))
      .returning({ valor: conciliacoesCartao.valorBruto })

    const pixMcp = await tx.update(pixRecebimentosMcp)
      .set({
        vendaId: null, tipoCorrespondencia: null, osId: null,
        pedidoId: null, pecaVendaId: null, lancadoPorId: null, lancadoEm: null,
      })
      .where(eq(pixRecebimentosMcp.vendaId, vendaId))
      .returning({ valor: pixRecebimentosMcp.valor })

    const dems = await tx.update(demandas)
      .set({ vendaId: null })
      .where(eq(demandas.vendaId, vendaId))
      .returning({ id: demandas.id })

    desvinculados.cartao   = cartoes.length
    desvinculados.pix      = pixMcp.length
    desvinculados.demandas = dems.length
    desvinculados.valor    = cartoes.reduce((a, c) => a + Number(c.valor), 0)
      + pixMcp.reduce((a, p) => a + Number(p.valor), 0)

    // Remover lancamentos antes da venda (lancamentos_caixa tem FK para vendas.id)
    await tx.delete(lancamentosCaixa).where(eq(lancamentosCaixa.vendaId, vendaId))

    // Documentos de assinatura também têm FK para vendas.id — sem isto o banco
    // recusa o delete. Eventos e códigos saem junto por ON DELETE CASCADE.
    // Cancelar a venda apaga o contrato daquela venda: o documento perde objeto
    // junto com ela. Por isso a contagem vai para o histórico do estoque, e um
    // contrato assinado nunca some calado.
    const docsAssinatura = await tx.delete(documentosAssinatura)
      .where(eq(documentosAssinatura.vendaId, vendaId))
      .returning({
        status: documentosAssinatura.status,
        selfiePath: documentosAssinatura.selfiePath,
        assinaturaPath: documentosAssinatura.assinaturaPath,
      })
    desvinculados.documentosAssinados = docsAssinatura.filter(d => d.status === 'assinado').length
    // Guarda os caminhos para limpar o bucket DEPOIS da transação: Storage é
    // outro serviço e não participa do rollback do Postgres.
    arquivosAssinatura.push(
      ...docsAssinatura.flatMap(d => [d.selfiePath, d.assinaturaPath].filter((p): p is string => !!p)),
    )

    // Remover a venda
    await tx.delete(vendas).where(eq(vendas.id, vendaId))

    // Registrar no histórico
    const recebido = desvinculados.valor > 0
      ? ` — Recebimentos desvinculados: ${desvinculados.cartao} cartão + ${desvinculados.pix} PIX (R$ ${desvinculados.valor.toFixed(2)})`
      : ''
    const assinaturas = desvinculados.documentosAssinados > 0
      ? ` — ${desvinculados.documentosAssinados} documento(s) ASSINADO(S) removido(s) com a venda`
      : ''
    await tx.insert(historicoEstoque).values({
      motoId: vendaRecord.motoId,
      lojaDestinoId: vendaRecord.lojaId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      statusAnterior: 'vendida',
      statusNovo: 'montada',
      observacao: `Venda cancelada — Cliente: ${vendaRecord.clienteNome} — Valor: R$ ${Number(vendaRecord.valor).toFixed(2)}${recebido}${assinaturas} — Motivo: ${motivo}`,
    })
    return false
  })
  if (notaVivaNoMeio) {
    const agora = await travaDoCancelamentoDaVendaAction(vendaId)
    if (agora.ok && agora.trava) return { ok: false as const, error: agora.trava, travada: true }
    return { ok: false as const, error: 'uma NF de saída entrou nesta venda agora' }
  }

  // Selfies e traços da assinatura. Fora da transação porque o Storage é outro
  // serviço; best-effort, pois a venda já foi cancelada e um erro aqui só
  // deixaria arquivo órfão — nunca deve derrubar o cancelamento.
  if (arquivosAssinatura.length > 0) {
    try {
      const storage = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { error } = await storage.storage.from('assinaturas').remove(arquivosAssinatura)
      if (error) console.error('[assinatura] falha ao apagar arquivos do bucket:', error.message)
    } catch (e) {
      console.error('[assinatura] falha ao apagar arquivos do bucket:', e)
    }
  }

  // A venda foi apagada: o detalhe precisa bastar sozinho.
  await registrarAcaoSensivelSemFalhar({
    tipo: 'venda_cancelada', usuarioId: usuario.id, lojaId: vendaRecord.lojaId,
    detalhe: { vendaId, numeroVenda: vendaRecord.numero, cliente: vendaRecord.clienteNome, valor: vendaRecord.valor, motivo: motivo.trim() },
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath('/caixa')
  revalidatePath('/dashboard')
  revalidatePath('/conciliacao')
  revalidatePath('/pix-mcp')

  return { ok: true as const, ...desvinculados }
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
  // A entrada pode ser dividida em mais de uma forma; a soma tem que fechar com
  // valorReserva (reconferido aqui — o cliente não é fonte de verdade).
  pagamentos: PagamentoEntrada[]
  dataPrevistaFinalizacao: string
  dataReserva?: string
}

export async function registrarReservaAction(...a: Parameters<typeof registrarReserva>) {
  return acao(() => registrarReserva(...a))
}

async function registrarReserva(data: DadosReserva) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão para registrar reserva')
  }

  const moto = await motoDoUsuario(usuario, data.motoId)
  if (!moto) throw new RecusaUsuario('Moto não encontrada')
  await conferirMaquininhas(db, moto.lojaId, data.pagamentos)
  if (moto.status === 'vendida' || moto.disponibilidade === 'vendida') {
    throw new RecusaUsuario('Moto já foi vendida')
  }
  if (moto.disponibilidade === 'reservada') {
    throw new RecusaUsuario('Moto já está reservada')
  }
  if (moto.disponibilidade === 'aguardando_aprovacao') {
    throw new RecusaUsuario('Moto tem uma venda aguardando aprovação. Aprove ou recuse antes de reservar.')
  }

  // A checagem acima olha a disponibilidade da MOTO, que é editável no "Editar
  // moto" — e foi por aí que o chassi 192922510890343 ganhou duas reservas
  // ativas. A trava que vale é a própria reserva.
  const [jaReservada] = await db
    .select({ id: reservas.id, cliente: reservas.clienteNome })
    .from(reservas)
    .where(and(eq(reservas.motoId, data.motoId), eq(reservas.status, 'ativa')))
    .limit(1)
  if (jaReservada) {
    throw new RecusaUsuario(
      `Moto já tem reserva ativa${jaReservada.cliente ? ` (${jaReservada.cliente})` : ''}. Cancele antes de reservar de novo.`,
    )
  }

  const valorNum = parseFloat(data.valorReserva)
  if (isNaN(valorNum) || valorNum <= 0) throw new RecusaUsuario('Valor de reserva inválido')

  const { clienteCpf } = conferirComprador(data.clienteCpf)

  const pagamentos = data.pagamentos ?? []
  if (pagamentos.some(p => !p.tipo || !(p.valor > 0))) {
    throw new RecusaUsuario('Toda forma de pagamento precisa de tipo e valor')
  }
  if (!pagamentosFecham(pagamentos, valorNum)) {
    throw new RecusaUsuario(
      `A soma das formas de pagamento (${somaPagamentos(pagamentos).toFixed(2)}) não bate com a entrada (${valorNum.toFixed(2)})`,
    )
  }
  // meio_pagamento e as colunas de cartão guardam a PRIMEIRA linha — é o que o
  // comprovante, o histórico e queries/motos.ts leem. O detalhe vai no jsonb.
  const principal = pagamentos[0]

  const prec = await buscarPrecificacao(moto.modeloId, moto.lojaId)
  if (prec) {
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const valorTotalNum = parseFloat(data.valorTotalVenda)
    const check = validarReserva(valorNum, isNaN(valorTotalNum) ? 0 : valorTotalNum, prec.valorMinimoPix)
    if (!check.entradaOk) {
      throw new RecusaUsuario(`Entrada mínima de ${fmt(check.minimoEntrada)} (30% do preço PIX ${fmt(prec.valorMinimoPix)})`)
    }
    // Total negociado é livre — depende da forma de pagamento (PIX, cartão, etc.)
    // Apenas a entrada mínima de 30% é obrigatória para reservas
  }

  const podeEscolherVendedorReserva = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const vendedorIdReserva = (podeEscolherVendedorReserva && data.vendedorId) ? data.vendedorId : usuario.id
  if (vendedorIdReserva !== usuario.id && !(await vendedorDaConta(vendedorIdReserva, moto.lojaId))) {
    throw new RecusaUsuario('Vendedor não encontrado')
  }

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
      meioPagamento: principal.tipo,
      pagamentos,
      cartaoOperadora: principal.operadora ?? null,
      cartaoParcelas: principal.parcelas ? String(principal.parcelas) : null,
      dataPrevistaFinalizacao: data.dataPrevistaFinalizacao,
      status: 'ativa',
      clienteNome: data.clienteNome,
      clienteCpf,
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

    await tx.insert(historicoEstoque).values({
      motoId: data.motoId,
      lojaOrigemId: moto.lojaId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      observacao: `Reserva — Cliente: ${data.clienteNome} — Entrada: R$ ${valorNum.toFixed(2)} — Total: R$ ${valorTotalNum.toFixed(2)} — ${descreverPagamentos(pagamentos)} — Previsão: ${data.dataPrevistaFinalizacao}`,
    })
  })

  revalidatePath('/estoque')
  return { id: reservaId }
}

const PAPEIS_CANCELAR_RESERVA = ['admin_geral', 'admin_socio', 'aux_adm']

/**
 * Cancela uma reserva ativa e devolve a moto para venda.
 *
 * Não mexe em dinheiro de propósito: a reserva nunca lançou o sinal no caixa
 * (quem lança é a venda, quando a reserva é convertida), então um estorno aqui
 * criaria uma saída sem a entrada correspondente. A devolução do sinal ao
 * cliente, se houver, é combinada fora do sistema — por isso o motivo é
 * obrigatório e fica gravado.
 *
 * Com venda aguardando aprovação o cancelamento é recusado (ver
 * motivoBloqueioCancelarReserva): primeiro se aprova ou recusa a venda.
 */
export async function cancelarReservaAction(...a: Parameters<typeof cancelarReserva>) {
  return acao(() => cancelarReserva(...a))
}

async function cancelarReserva(reservaId: string, motivo: string) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_CANCELAR_RESERVA.includes(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão para cancelar reserva')
  }

  const motivoLimpo = motivo.trim()
  if (motivoLimpo.length < 3) throw new RecusaUsuario('Informe o motivo do cancelamento')

  const reserva = await reservaDoUsuario(usuario, reservaId)
  if (!reserva) throw new RecusaUsuario('Reserva não encontrada')

  // Quem tem loja fica nela; quem não tem (admin_geral, sócio sem loja) só no grupo que vê.
  if (usuario.lojaId ? reserva.lojaId !== usuario.lojaId : !(await podeAbrirRegistroDaLoja(usuario, reserva.lojaId))) {
    throw new RecusaUsuario('Sem permissão para cancelar reserva de outra loja')
  }

  if (reserva.status === 'cancelada') throw new RecusaUsuario('Reserva já está cancelada')
  if (reserva.status === 'convertida') {
    throw new RecusaUsuario('Reserva já virou venda. Cancele a venda, não a reserva.')
  }

  await db.transaction(async (tx) => {
    // Trava a linha até o commit: um pedido de aprovação gravado no meio
    // seria sobrescrito para 'disponivel' lá embaixo, deixando a moto à venda
    // com o pedido ainda pendente.
    const [moto] = await tx
      .select({ status: motos.status, disponibilidade: motos.disponibilidade })
      .from(motos)
      .where(eq(motos.id, reserva.motoId))
      .limit(1)
      .for('update')
    if (!moto) throw new RecusaUsuario('Moto não encontrada')
    const bloqueio = motivoBloqueioCancelarReserva(moto)
    if (bloqueio) throw new RecusaUsuario(bloqueio)

    // O filtro por status no UPDATE evita corrida com quem estiver convertendo
    // a reserva em venda neste instante.
    const cancelada = await tx.update(reservas)
      .set({
        status: 'cancelada',
        canceladaEm: new Date(),
        canceladaPor: usuario.id,
        cancelamentoMotivo: motivoLimpo,
      })
      .where(and(eq(reservas.id, reservaId), eq(reservas.status, 'ativa')))
      .returning({ id: reservas.id })
    if (cancelada.length === 0) throw new RecusaUsuario('A reserva mudou de estado. Recarregue a página.')

    // Uma moto não deveria ter duas reservas ativas, mas tem na base (o buraco
    // que este botão fecha). Enquanto sobrar outra, a moto continua reservada.
    const [outraAtiva] = await tx
      .select({ id: reservas.id })
      .from(reservas)
      .where(and(eq(reservas.motoId, reserva.motoId), eq(reservas.status, 'ativa')))
      .limit(1)

    // Só mexe se ainda estiver 'reservada': moto na caixa sem disponibilidade
    // ou já 'disponivel' (reserva duplicada) fica como está.
    if (!outraAtiva && moto.disponibilidade === 'reservada') {
      await tx.update(motos)
        // Moto ainda na caixa volta para disponibilidade nula — é o estado de
        // quem não foi montada; 'disponivel' a colocaria à venda sem montagem.
        .set({ disponibilidade: moto.status === 'caixa' ? null : 'disponivel' })
        .where(eq(motos.id, reserva.motoId))
    }

    const valor = parseFloat(reserva.valorReserva)
    await tx.insert(historicoEstoque).values({
      motoId: reserva.motoId,
      lojaOrigemId: reserva.lojaId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      observacao: `Reserva CANCELADA — Cliente: ${reserva.clienteNome ?? '—'} — Entrada: R$ ${(isNaN(valor) ? 0 : valor).toFixed(2)} — Motivo: ${motivoLimpo}`,
    })
  })

  revalidatePath('/estoque')
  revalidatePath(`/estoque/${reserva.motoId}`)
  return { motoId: reserva.motoId }
}

export type PagamentoEditar = {
  tipo: string
  valor: number
  operadora?: string
  parcelas?: number
  autorizacao?: string
}

export async function editarVendaAction(...a: Parameters<typeof editarVenda>) {
  return acao(() => editarVenda(...a))
}

async function editarVenda(vendaId: string, dados: {
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
  /** Ausentes (`undefined`) = não mexe no representante gravado. */
  representanteNome?: string | null
  representanteCpf?:  string | null
  /** Ausente (`undefined`) = não mexe no contribuinte de ICMS gravado. */
  clienteIndicadorIe?:       string | null
  clienteInscricaoEstadual?: string | null
  origemId?:          string | null
  origemDetalhe?:     string | null
}) {
  const usuario = await getUsuarioLogado()

  const ADMINS_EDIT = ['admin_geral', 'admin_socio', 'aux_adm']
  if (!ADMINS_EDIT.includes(usuario.papel)) throw new RecusaUsuario('Sem permissão')

  // Busca venda atual para validações de acesso e sincronização
  const vendaAtual = await vendaDoUsuario(usuario, eq(vendas.id, vendaId))
  if (!vendaAtual) throw new RecusaUsuario('Venda não encontrada')

  // Quem tem loja só edita venda dela; quem não tem, só no grupo que vê.
  if (usuario.lojaId ? vendaAtual.lojaId !== usuario.lojaId : !(await podeAbrirRegistroDaLoja(usuario, vendaAtual.lojaId))) {
    throw new RecusaUsuario('Sem permissão para editar vendas de outra loja')
  }
  await conferirMaquininhas(db, vendaAtual.lojaId, dados.pagamentos, operadorasGravadas(vendaAtual.pagamentos))

  // Origem é corrigível: campo obrigatório que só pudesse ser preenchido uma vez
  // produziria dado ruim para sempre. Só valida quando veio no payload — editar
  // uma venda antiga sem origem não obriga a inventar uma.
  const origemCorrigida = dados.origemId
    ? await garantirOrigemValida(vendaAtual.lojaId, dados.origemId, dados.origemDetalhe)
    : null

  if (dados.vendedorId && !(await vendedorDaConta(dados.vendedorId, vendaAtual.lojaId))) {
    throw new RecusaUsuario('Vendedor não encontrado')
  }

  const comprador = conferirCompradorDaVenda(dados, vendaAtual.clienteCpf)

  // ── Validação financeira ─────────────────────────────────────────────────────
  const valorNum = parseFloat(dados.valor.replace(',', '.'))
  if (!valorNum || valorNum <= 0) throw new RecusaUsuario('Valor da venda inválido')
  const travaValor = travaDoValorVenda(usuario.papel, Number(vendaAtual.valor), valorNum)
  if (travaValor) throw new RecusaUsuario(travaValor)

  for (const p of dados.pagamentos) {
    if (!p.valor || p.valor <= 0) throw new RecusaUsuario('Valor de pagamento inválido')
  }

  const somaPayments = dados.pagamentos.reduce((s, p) => s + Number(p.valor), 0)
  if (Math.abs(somaPayments - valorNum) > 0.01) {
    throw new RecusaUsuario('Soma dos pagamentos não confere com o valor total')
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
        dataVenda:          parseDataInput(dados.dataVenda),
        notaFiscalSaida:    nfFinal,
        pagamentos:         dados.pagamentos,
        formaPagamento,
        ...(dados.vendedorId ? { vendedorId: dados.vendedorId } : {}),
        ...(origemCorrigida ? {
          origemId:      origemCorrigida.origemId,
          origemDetalhe: origemCorrigida.origemDetalhe,
        } : {}),
      })
      .where(eq(vendas.id, vendaId))
    await gravarCompradorDaVenda(tx, { id: vendaId, lojaId: vendaAtual.lojaId }, {
      ...comprador,
      // A edição manda o formulário inteiro: campo vazio apaga, como antes.
      dados: {
        ...dados,
        clienteCelular: dados.clienteCelular ?? null, clienteEmail: dados.clienteEmail ?? null,
        clienteCep: dados.clienteCep ?? null, clienteLogradouro: dados.clienteLogradouro ?? null,
        clienteNumero: dados.clienteNumero ?? null, clienteComplemento: dados.clienteComplemento ?? null,
        clienteBairro: dados.clienteBairro ?? null, clienteCidade: dados.clienteCidade ?? null,
        clienteEstado: dados.clienteEstado ?? null,
      },
    })

    // Os cards de pedido leem o vendedor do pedido; sem isso, a correção só aparece na venda.
    if (dados.vendedorId) {
      await tx.update(pedidosVenda)
        .set({ vendedorId: dados.vendedorId })
        .where(eq(pedidosVenda.id, vendaAtual.pedidoVendaId))
    }

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

// ─── Buscar cliente por CPF/CNPJ ──────────────────────────────────────────────────

export async function buscarClientePorCpfAction(cpf: string) {
  const usuario = await getUsuarioLogado()
  const contaId = await contaDoGrupoAtivo(usuario)
  const cpfLimpo = cpf.replace(/\D/g, '')
  if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) return null

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
      indicadorIe: clientes.indicadorIe,
      inscricaoEstadual: clientes.inscricaoEstadual,
    })
    .from(clientes)
    .where(and(eq(clientes.cpfCnpj, cpfLimpo), clientesDoEscopo(contaId, usuario)))
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
      indicadorIe: vendas.clienteIndicadorIe,
      inscricaoEstadual: vendas.clienteInscricaoEstadual,
    })
    .from(vendas)
    // A venda grava o documento formatado; compara só os dígitos.
    .where(and(
      sql`regexp_replace(${vendas.clienteCpf}, '[^0-9]', '', 'g') = ${cpfLimpo}`,
      inArray(vendas.lojaId, lojasDoEscopo({ contaId, grupoLiberado: usuario.grupoLiberado })),
    ))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  if (venda) return { source: 'vendas' as const, ...venda }

  return null
}

export async function buscarHistoricoMotoAction(...a: Parameters<typeof buscarHistoricoMoto>) {
  return acao(() => buscarHistoricoMoto(...a))
}

async function buscarHistoricoMoto(motoId: string) {
  const usuario = await getUsuarioLogado()

  // Moto de outra Conta responde como inexistente: lista vazia (#404).
  if (usuario.papel !== 'admin_geral' && !usuario.contaId) return []
  const [moto] = await db
    .select({ lojaId: motos.lojaId })
    .from(motos)
    .where(and(eq(motos.id, motoId), usuario.papel === 'admin_geral' ? undefined : inArray(motos.lojaId, lojasDoEscopo(usuario))))
    .limit(1)
  if (!moto) return []

  const ADMINS = ['admin_geral', 'admin_socio', 'aux_adm']
  if (ADMINS.includes(usuario.papel) ? !(await podeAbrirRegistroDaLoja(usuario, moto.lojaId)) : moto.lojaId !== usuario.lojaId) {
    throw new RecusaUsuario('Sem permissão')
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

export async function buscarDanfeAction(...a: Parameters<typeof buscarDanfe>) {
  return acao(() => buscarDanfe(...a))
}

async function buscarDanfe(motoId: string): Promise<{ linkDanfe: string | null; linkPDF: string | null }> {
  const usuario = await getUsuarioLogado()

  const venda = await vendaDoUsuario(usuario, eq(vendas.motoId, motoId))

  // NF emitida pelo próprio MOVA (Nota Gateway) vem antes do Bling: a nota viva
  // mais recente que tem DANFE, inclusive a com cancelamento negado.
  if (venda) {
    const [propria] = await db
      .select({ linkDanfe: notasFiscaisSaida.linkDanfe })
      .from(notasFiscaisSaida)
      .where(and(
        eq(notasFiscaisSaida.vendaId, venda.id),
        eq(notasFiscaisSaida.ambiente, 'Producao'),
        notInArray(notasFiscaisSaida.status, STATUS_MORTOS),
        isNotNull(notasFiscaisSaida.linkDanfe),
      ))
      .orderBy(desc(notasFiscaisSaida.criadoEm))
      .limit(1)
    if (propria?.linkDanfe) return { linkDanfe: propria.linkDanfe, linkPDF: propria.linkDanfe }
  }

  if (!venda) throw new RecusaUsuario('Esta moto não tem venda registrada.')

  // Nota do Bling: abre a cópia arquivada no Storage, que continua valendo
  // depois que a conta do Bling for encerrada.
  const grupoId = await getGrupoIdDaLoja(venda.lojaId)
  let pdfPath: string | null = null
  if (venda.blingNfeId) {
    const [arquivada] = await db
      .select({ pdfPath: nfeBlingArquivo.pdfPath })
      .from(nfeBlingArquivo)
      .where(and(eq(nfeBlingArquivo.grupoId, grupoId), eq(nfeBlingArquivo.blingNfeId, venda.blingNfeId)))
      .limit(1)
    pdfPath = arquivada?.pdfPath ?? null
  }
  // Sem o id (NF registrada à mão) ou com o id de um rascunho que nunca foi
  // transmitido: cai no número digitado na venda, que se repete entre séries.
  // Só vale uma única nota e confirmada pelo CPF/CNPJ do cliente — ou, nas
  // vendas importadas sem cliente (CPF 000.000.000-00), pela data: emitida até
  // 15 dias da venda.
  if (!pdfPath && venda.notaFiscalSaida) {
    const cpf = (venda.clienteCpf ?? '').replace(/\D/g, '')
    const confirma = /^0*$/.test(cpf)
      ? sql`abs(${nfeBlingArquivo.dataEmissao} - ${hojeBrt(venda.dataVenda)}::date) <= 15`
      : eq(nfeBlingArquivo.documento, cpf)
    const porNumero = await db
      .select({ pdfPath: nfeBlingArquivo.pdfPath })
      .from(nfeBlingArquivo)
      .where(and(
        eq(nfeBlingArquivo.grupoId, grupoId),
        sql`ltrim(${nfeBlingArquivo.numero}, '0') = ltrim(${venda.notaFiscalSaida.trim()}, '0')`,
        isNotNull(nfeBlingArquivo.pdfPath),
        confirma,
      ))
      .limit(2)
    if (porNumero.length === 1) pdfPath = porNumero[0].pdfPath
  }
  if (pdfPath) {
    const { createClient } = await import('@supabase/supabase-js')
    const { data } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .storage.from('nfe-bling').createSignedUrl(pdfPath, 600)
    if (data?.signedUrl) return { linkDanfe: data.signedUrl, linkPDF: data.signedUrl }
  }

  if (!venda.blingNfeId) throw new RecusaUsuario('Esta NF foi registrada à mão, fora do MOVA. O DANFE não está disponível aqui.')

  const { buscarLinksDanfe } = await import('@/lib/bling')
  const links = await buscarLinksDanfe(grupoId, venda.blingNfeId)

  if (!links.linkDanfe && !links.linkPDF) throw new RecusaUsuario('DANFE não disponível. A NF-e ainda não foi autorizada no Bling.')

  return links
}

// ─── Aprovação de venda abaixo do valor mínimo ────────────────────────────────

export async function solicitarAprovacaoVendaAction(...a: Parameters<typeof solicitarAprovacaoVenda>) {
  return acao(() => solicitarAprovacaoVenda(...a))
}

async function solicitarAprovacaoVenda(
  data: DadosVendaCompleta,
  motivo: string,
  tipoAprovacao: 'valor_minimo' | 'pagamento_sensivel' = 'valor_minimo',
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão para registrar venda')
  }
  // Confere já no pedido: documento inválido só quebraria na hora de aprovar.
  data = comCompradorConferido(data)

  const moto = await motoDoUsuario(usuario, data.motoId)
  if (!moto) throw new RecusaUsuario('Moto não encontrada')
  const bloqueio = motivoBloqueioPedidoAprovacao(moto)
  await conferirMaquininhas(db, moto.lojaId, data.pagamentos)
  if (bloqueio) throw new RecusaUsuario(bloqueio)

  const valorNum = parseFloat(data.valorTotal)
  if (isNaN(valorNum) || valorNum <= 0) throw new RecusaUsuario('Valor inválido')

  const soma = data.pagamentos.reduce((a, p) => a + p.valor, 0)
  if (Math.abs(soma - valorNum) > 0.01) {
    throw new RecusaUsuario('Somatório das formas de pagamento difere do valor da venda')
  }

  // Valida a origem já aqui, não só na aprovação: um dados_venda inválido só
  // quebraria na hora de aprovar, na frente de quem aprova.
  await garantirOrigemValida(moto.lojaId, data.origemId, data.origemDetalhe)

  let motivoFinal: string
  // Snapshot do desconto: só existe no fluxo de valor mínimo. Fica NULL em
  // 'pagamento_sensivel', onde a trava não é sobre preço.
  let snapshot: { valorMinimo: string; liquido: string } | null = null
  if (tipoAprovacao === 'pagamento_sensivel') {
    if (!temPagamentoSensivel(data.pagamentos)) {
      throw new RecusaUsuario('Nenhum pagamento por transferência bancária nesta venda')
    }
    const tiposUsados = data.pagamentos
      .filter(p => TIPOS_PAGAMENTO_SENSIVEL.has(p.tipo))
      .map(() => 'Transferência Bancária')
    motivoFinal = motivo.trim() || `Pagamento via ${[...new Set(tiposUsados)].join(' + ')}`
  } else {
    if (!motivo.trim()) throw new RecusaUsuario('Informe o motivo do pedido de aprovação')
    const prec = await buscarPrecificacao(moto.modeloId, moto.lojaId)
    if (!prec) throw new RecusaUsuario('Sem preço mínimo configurado para este modelo. Use o fluxo normal de venda')
    const liquido = calcLiquidoRecebido(data.pagamentos, prec.taxas)
    if (liquido >= prec.valorMinimoPix - 0.01) {
      throw new RecusaUsuario('Valor está dentro do mínimo. Use o fluxo normal de venda')
    }
    // Congela os dois lados da conta que acabou de reprovar a venda. Recalcular
    // isso depois usaria a precificação de então, que muda — ver a migração 0065.
    snapshot = { valorMinimo: prec.valorMinimoPix.toFixed(2), liquido: liquido.toFixed(2) }
    motivoFinal = motivo.trim()
  }

  const podeEscolherVendedor = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const vendedorId = (podeEscolherVendedor && data.vendedorId) ? data.vendedorId : usuario.id
  if (vendedorId !== usuario.id && !(await vendedorDaConta(vendedorId, moto.lojaId))) {
    throw new RecusaUsuario('Vendedor não encontrado')
  }

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
      valorMinimoSnapshot: snapshot?.valorMinimo ?? null,
      liquidoSnapshot: snapshot?.liquido ?? null,
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

export async function aprovarVendaAction(...a: Parameters<typeof aprovarVenda>) {
  return acao(() => aprovarVenda(...a))
}

async function aprovarVenda(aprovacaoId: string) {
  const usuario = await getUsuarioLogado()

  const aprovacao = await aprovacaoDoUsuario(usuario, aprovacaoId)
  if (!aprovacao) throw new RecusaUsuario('Solicitação não encontrada')

  const podeResponder = aprovacao.tipo === 'pagamento_sensivel'
    ? await podeAprovarPagamentoSensivelNaLoja(usuario, aprovacao.lojaId)
    : await podeAprovarVendaBaixoValor(usuario, aprovacao.lojaId)
  if (!podeResponder) {
    throw new RecusaUsuario('Sem permissão para aprovar esta venda')
  }
  if (aprovacao.status !== 'pendente') throw new RecusaUsuario('Esta solicitação não está mais pendente. Recarregue a página.')

  // OS: a linha já existe (aberta antes do pagamento) — só aplica o pagamento retido.
  if (aprovacao.origem === 'os') {
    if (!aprovacao.osId) throw new Error('Aprovação de OS sem os_id')
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(aprovacoesVenda)
        .set({ status: 'aprovada', respondidoPor: usuario.id, dataResposta: new Date() })
        .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
        .returning({ id: aprovacoesVenda.id })
      if (!claimed) throw new RecusaUsuario('Esta solicitação não está mais pendente. Recarregue a página.')
    })
    await aplicarPagamentoOS(aprovacao.osId, aprovacao.dadosVenda as unknown as DadosPagamentoOS)
    revalidatePath('/vendas')
    return
  }

  // Edição de venda de peças (#242): a venda já existe — aplica a edição guardada no pedido,
  // atômico com o UPDATE de aprovação. Se a venda foi excluída nesse meio-tempo, a transação
  // falha e o pedido continua pendente (dá para recusar).
  if (aprovacao.origem === 'peca_edicao') {
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(aprovacoesVenda)
        .set({ status: 'aprovada', respondidoPor: usuario.id, dataResposta: new Date() })
        .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
        .returning({ id: aprovacoesVenda.id })
      if (!claimed) throw new RecusaUsuario('Esta solicitação não está mais pendente. Recarregue a página.')

      await aplicarEdicaoAprovadaTx(tx, aprovacao.dadosVenda as unknown as EdicaoPendente, aprovacao.vendedorId)
    })
    revalidatePath('/vendas')
    revalidatePath('/pecas')
    return
  }

  // Peça: a venda ainda não existe — cria de fato, atômico com o UPDATE de aprovação.
  if (aprovacao.origem === 'peca') {
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(aprovacoesVenda)
        .set({ status: 'aprovada', respondidoPor: usuario.id, dataResposta: new Date() })
        .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
        .returning({ id: aprovacoesVenda.id })
      if (!claimed) throw new RecusaUsuario('Esta solicitação não está mais pendente. Recarregue a página.')

      await aplicarVendaPeca(tx, aprovacao.vendedorId, aprovacao.dadosVenda as unknown as DadosVendaPeca)
    })
    revalidatePath('/vendas')
    revalidatePath('/pecas')
    return
  }

  // Moto (fluxo original): a venda também não existe ainda.
  if (!aprovacao.motoId) throw new Error('Aprovação de moto sem moto_id')
  const [moto] = await db.select().from(motos).where(eq(motos.id, aprovacao.motoId)).limit(1)
  if (!moto) throw new RecusaUsuario('Moto não encontrada')

  const data = aprovacao.dadosVenda as unknown as DadosVendaCompleta
  const dataVendaFinal = data.dataVenda ? parseDataInput(data.dataVenda) : new Date()

  // Revalida aqui também: o dados_venda pode ter sido gravado antes deste deploy
  // (sem origem) ou a origem pode ter sido desativada enquanto a venda esperava
  // aprovação. Falhar aqui é chato; gravar venda sem origem é pior.
  const origem = await garantirOrigemValida(moto.lojaId, data.origemId, data.origemDetalhe)

  await db.transaction(async (tx) => {
    // UPDATE condicionado a status = 'pendente' — evita duplicar a venda se
    // dois aprovadores confirmarem ao mesmo tempo.
    const [claimed] = await tx.update(aprovacoesVenda)
      .set({ status: 'aprovada', respondidoPor: usuario.id, dataResposta: new Date() })
      .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
      .returning({ id: aprovacoesVenda.id })
    if (!claimed) throw new RecusaUsuario('Esta solicitação não está mais pendente. Recarregue a página.')

    await criarVendaTx(tx, { moto, data, vendedorId: aprovacao.vendedorId, efetivadoPor: usuario.id, dataVendaFinal, origem })
  })

  revalidatePath('/vendas')
  revalidatePath('/estoque')
  revalidatePath(`/estoque/${aprovacao.motoId}`)
  revalidatePath('/caixa')

  // Venda aprovada também avisa — senão toda venda negociada abaixo do mínimo
  // sairia do radar do grupo justamente por ter passado por aprovação.
  await avisarVendaNoWhatsapp({
    lojaId: moto.lojaId,
    modeloId: moto.modeloId,
    vendedorId: aprovacao.vendedorId,
    valor: parseFloat(String(aprovacao.valor)),
  })
}

export async function recusarVendaAction(...a: Parameters<typeof recusarVenda>) {
  return acao(() => recusarVenda(...a))
}

async function recusarVenda(aprovacaoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()

  const aprovacao = await aprovacaoDoUsuario(usuario, aprovacaoId)
  if (!aprovacao) throw new RecusaUsuario('Solicitação não encontrada')

  const podeResponder = aprovacao.tipo === 'pagamento_sensivel'
    ? await podeAprovarPagamentoSensivelNaLoja(usuario, aprovacao.lojaId)
    : await podeAprovarVendaBaixoValor(usuario, aprovacao.lojaId)
  if (!podeResponder) {
    throw new RecusaUsuario('Sem permissão para recusar esta venda')
  }
  if (aprovacao.status !== 'pendente') throw new RecusaUsuario('Esta solicitação não está mais pendente. Recarregue a página.')

  // OS/Peça: nada foi criado/reservado ainda (a OS continua como estava, sem pagamento
  // aplicado; a venda de peça nunca chegou a existir) — só marca a solicitação como recusada.
  if (aprovacao.origem !== 'moto') {
    const [claimed] = await db.update(aprovacoesVenda)
      .set({ status: 'recusada', respondidoPor: usuario.id, dataResposta: new Date() })
      .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
      .returning({ id: aprovacoesVenda.id })
    if (!claimed) throw new RecusaUsuario('Esta solicitação não está mais pendente. Recarregue a página.')

    revalidatePath('/vendas')
    if (aprovacao.origem === 'os')   revalidatePath(`/ordens-servico/${aprovacao.osId}`)
    if (aprovacao.origem === 'peca' || aprovacao.origem === 'peca_edicao') revalidatePath('/pecas')
    return
  }

  await db.transaction(async (tx) => {
    // UPDATE condicionado a status = 'pendente' — evita recusar duas vezes
    // (ou recusar depois de já aprovada) se dois aprovadores agirem juntos.
    const [claimed] = await tx.update(aprovacoesVenda)
      .set({ status: 'recusada', respondidoPor: usuario.id, dataResposta: new Date() })
      .where(and(eq(aprovacoesVenda.id, aprovacaoId), eq(aprovacoesVenda.status, 'pendente')))
      .returning({ id: aprovacoesVenda.id })
    if (!claimed) throw new RecusaUsuario('Esta solicitação não está mais pendente. Recarregue a página.')

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


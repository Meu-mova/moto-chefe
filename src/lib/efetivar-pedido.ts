import { and, eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { clientes, historicoEstoque, lancamentosCaixa, motos, pedidosVenda, reservas, vendas } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { lancamentosDinheiroDaVenda } from '@/lib/caixa-venda-moto'
import { conferirMaquininhas } from '@/lib/maquininhas'
import { formaPagamentoDaVenda, pagamentosFecham, pagamentosIncompletos, PAGAMENTO_INCOMPLETO, projetarPagamentos, SOMA_PAGAMENTOS_DIFERE, type PagamentoEntrada } from '@/lib/pagamentos-entrada'
import { clientesDoEscopo, contaDaLoja } from '@/lib/conta'
import { RecusaUsuario } from '@/lib/resultado-action'
import { gravarMotoDoPedido } from '@/lib/pedido-venda'
import { freteDaVenda, totalComFrete, type EntregaVenda } from '@/lib/notagateway/entrega'
import { motivoBloqueioPedidoAprovacao } from '@/lib/estado-moto'
import { gravarPedidoDeAprovacaoTx } from '@/lib/pedido-de-aprovacao'
import type { TipoAprovacaoVenda } from '@/lib/aprovacao-venda'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type DadosEfetivarPedido = {
  pedidoId: string
  /** Loja do pedido conferida pela action (permissão e origem). A gravação usa a loja lida do pedido sob a trava. */
  lojaId: string
  efetivadoPor: string
  clienteId: string | null
  clienteNome: string
  clienteCpf: string
  /** Valor da moto digitado na efetivação; o frete cobrado vem do pedido e se soma aqui (#726). */
  valor: number
  /** Pagamento do pedido inteiro (#775): as formas somam moto + frete. */
  pagamentos: PagamentoEntrada[]
  origem: { origemId: string; origemDetalhe: string | null }
  /** Persona do admin_rede (#517): só cliente do grupo liberado. */
  grupoLiberado: string | null
  /** Vindo da aprovação do pedido (#776): a moto está "aguardando aprovação" por causa dele mesmo. */
  daAprovacao?: boolean
}

/** O que o pedido em aprovação guarda em `dados_venda` para a aprovação efetivar depois (#776). */
export type PedidoEmAprovacao = Omit<DadosEfetivarPedido, 'efetivadoPor' | 'daAprovacao'> & {
  numero: number
  /** Frete cobrado, guardado junto: o líquido do snapshot é sem ele (decisão do Luis, #776). */
  frete: number
}

async function travarPedidoEMoto(tx: Tx, pedidoId: string, daAprovacao: boolean) {
  const [pedido] = await tx
    .select({ motoId: pedidosVenda.motoId, lojaId: pedidosVenda.lojaId, vendedorId: pedidosVenda.vendedorId, status: pedidosVenda.status, entrega: pedidosVenda.entrega })
    .from(pedidosVenda)
    .where(eq(pedidosVenda.id, pedidoId))
    .for('update')
  if (!pedido) throw new RecusaUsuario('Pedido não encontrado')
  if (pedido.status !== 'pendente') {
    throw new RecusaUsuario('Este pedido não está mais pendente. Recarregue a página.')
  }

  const [moto] = await tx
    .select({ status: motos.status, disponibilidade: motos.disponibilidade })
    .from(motos)
    .where(eq(motos.id, pedido.motoId))
    .for('update')
  if (!moto) throw new RecusaUsuario('Moto não encontrada')
  if (moto.status === 'vendida') throw new RecusaUsuario('Moto já foi vendida')
  if (!daAprovacao && moto.disponibilidade === 'aguardando_aprovacao') throw new RecusaUsuario(motivoBloqueioPedidoAprovacao(moto)!)
  return { pedido, moto }
}

/** Contato e endereço do cliente escolhido, lidos do cadastro da Conta; vazio sem cliente. */
async function clienteDoCadastro(tx: Tx, lojaId: string, d: Pick<DadosEfetivarPedido, 'clienteId' | 'grupoLiberado'>) {
  // Contato e endereço saem do cadastro, não do navegador: a NF exige o endereço (#577).
  // Campo vazio no cadastro fica vazio na venda; a prévia da NF avisa o que faltar.
  if (!d.clienteId) return {}
  // Cliente de outra Conta não existe para esta venda (ADR-0018); na persona, nem o de
  // outro grupo da Conta dona (ADR-0019).
  const contaId = await contaDaLoja(lojaId, tx)
  const [cliente] = await tx.select({
    clienteCelular: clientes.celular,
    clienteEmail: clientes.email,
    clienteCep: clientes.cep,
    clienteLogradouro: clientes.endereco,
    clienteNumero: clientes.numero,
    clienteComplemento: clientes.complemento,
    clienteBairro: clientes.bairro,
    clienteCidade: clientes.cidade,
    clienteEstado: clientes.uf,
    clienteIndicadorIe: clientes.indicadorIe,
    clienteInscricaoEstadual: clientes.inscricaoEstadual,
  }).from(clientes)
    .where(and(eq(clientes.id, d.clienteId), clientesDoEscopo(contaId, { contaId, grupoLiberado: d.grupoLiberado }))).limit(1)
  if (!cliente) throw new RecusaUsuario('Cliente não encontrado')
  return cliente
}

/** Confere as formas contra o total do pedido (moto + frete) e as maquininhas da loja; devolve o total. */
async function conferirPagamentos(tx: Tx, pedido: { lojaId: string; entrega: EntregaVenda | null }, d: Pick<DadosEfetivarPedido, 'valor' | 'pagamentos'>) {
  const total = totalComFrete(d.valor, freteDaVenda(pedido.entrega))
  // Aqui e não na action: o frete que entra no total só se conhece lendo o pedido.
  if (pagamentosIncompletos(d.pagamentos)) throw new RecusaUsuario(PAGAMENTO_INCOMPLETO)
  if (!pagamentosFecham(d.pagamentos, total)) throw new RecusaUsuario(SOMA_PAGAMENTOS_DIFERE)
  await conferirMaquininhas(tx, pedido.lojaId, d.pagamentos)
  return total
}

/**
 * Efetiva um pedido de venda pendente: cria a venda, fecha o pedido, marca a moto
 * como vendida e converte a reserva ativa. Substitui a rpc efetivar_venda (0050),
 * que exige app.encryption_key (não existe em nenhum banco) e gravaria nome e CPF
 * cifrados, enquanto o resto do sistema lê texto puro (#181).
 */
export async function efetivarPedidoTx(tx: Tx, d: DadosEfetivarPedido): Promise<{ vendaId: string }> {
  const { pedido } = await travarPedidoEMoto(tx, d.pedidoId, !!d.daAprovacao)
  const doCadastro = await clienteDoCadastro(tx, pedido.lojaId, d)

  const [reservaAtiva] = await tx
    .select({ id: reservas.id })
    .from(reservas)
    .where(and(eq(reservas.motoId, pedido.motoId), eq(reservas.status, 'ativa')))
    .limit(1)

  const total = await conferirPagamentos(tx, pedido, d)

  const agora = new Date()
  const valor = total.toFixed(2)
  const [venda] = await tx.insert(vendas).values({
    pedidoVendaId: d.pedidoId,
    motoId: pedido.motoId,
    lojaId: pedido.lojaId,
    vendedorId: pedido.vendedorId,
    efetivadoPor: d.efetivadoPor,
    clienteId: d.clienteId,
    ...doCadastro,
    clienteNome: d.clienteNome,
    clienteCpf: d.clienteCpf,
    valor,
    formaPagamento: formaPagamentoDaVenda(d.pagamentos),
    pagamentos: projetarPagamentos(d.pagamentos),
    reservaId: reservaAtiva?.id ?? null,
    dataVenda: agora,
    origemId: d.origem.origemId,
    origemDetalhe: d.origem.origemDetalhe,
    // A Entrega vem do pedido, lido aqui sob a trava: a efetivação não a recebe do navegador.
    entrega: pedido.entrega,
  }).returning({ id: vendas.id })
  // O item moto guarda só a moto: o frete fica na Entrega e no total da venda (#726; a #779 decide um item "frete").
  await gravarMotoDoPedido(tx, { pedidoId: d.pedidoId, motoId: pedido.motoId, valor: d.valor.toFixed(2) })

  if (reservaAtiva) {
    await tx.update(reservas).set({ status: 'convertida' }).where(eq(reservas.id, reservaAtiva.id))
  }

  await tx.update(pedidosVenda)
    .set({ status: 'efetivado', dataAtualizacao: agora })
    .where(eq(pedidosVenda.id, d.pedidoId))

  await tx.update(motos)
    .set({ status: 'vendida' as any, disponibilidade: null })
    .where(eq(motos.id, pedido.motoId))

  await tx.insert(historicoEstoque).values({
    motoId: pedido.motoId,
    lojaOrigemId: pedido.lojaId,
    usuarioId: d.efetivadoPor,
    tipo: 'saida',
    referenciaTipo: 'pedido_venda',
    referenciaId: d.pedidoId,
    observacao: `Venda (pedido efetivado) — Cliente: ${d.clienteNome} — Total: R$ ${valor}`,
  })

  const caixa = lancamentosDinheiroDaVenda(d.pagamentos, {
    lojaId: pedido.lojaId, usuarioId: d.efetivadoPor, vendaId: venda.id, descricao: `Venda dinheiro — ${d.clienteNome}`, data: hojeBrt(),
  })
  if (caixa.length > 0) await tx.insert(lancamentosCaixa).values(caixa)

  return { vendaId: venda.id }
}

/**
 * Manda o pedido para aprovação (#776): as mesmas conferências da efetivação, sem criar a venda.
 * O pedido continua pendente e a moto fica "aguardando aprovação"; aprovado, a aprovação chama o
 * efetivarPedidoTx com os dados guardados; recusado, a moto volta a reservada.
 */
export async function pedirAprovacaoDoPedidoTx(tx: Tx, d: DadosEfetivarPedido & {
  numero: number
  tipo: TipoAprovacaoVenda
  motivo: string
  snapshot: { valorMinimo: number; liquido: number } | null
}) {
  const { pedido, moto } = await travarPedidoEMoto(tx, d.pedidoId, false)
  await clienteDoCadastro(tx, pedido.lojaId, d)
  const total = await conferirPagamentos(tx, pedido, d)
  const guardado: PedidoEmAprovacao = {
    pedidoId: d.pedidoId, numero: d.numero, lojaId: pedido.lojaId, clienteId: d.clienteId, clienteNome: d.clienteNome,
    clienteCpf: d.clienteCpf, valor: d.valor, frete: freteDaVenda(pedido.entrega), pagamentos: projetarPagamentos(d.pagamentos),
    origem: d.origem, grupoLiberado: d.grupoLiberado,
  }
  await gravarPedidoDeAprovacaoTx(tx, {
    origem: 'pedido', moto: { id: pedido.motoId, lojaId: pedido.lojaId, disponibilidade: moto.disponibilidade },
    // Valor da moto, sem o frete (#796): desconto, quadro do #878 e relatório seguem sobre a moto; o frete fica em dados_venda.
    vendedorId: pedido.vendedorId, solicitadoPor: d.efetivadoPor, valor: d.valor.toFixed(2), dadosVenda: guardado,
    tipo: d.tipo, motivo: d.motivo, snapshot: d.snapshot,
    observacao: `Pedido #${d.numero} em aprovação — Cliente: ${d.clienteNome} — Total: R$ ${total.toFixed(2)} — Motivo: ${d.motivo}`,
  })
}

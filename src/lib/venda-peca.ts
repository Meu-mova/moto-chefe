import { db } from '@/lib/db'
import { pecasCatalogo, vendasPecas, vendasPecasItens } from '@/lib/db/schema'
import { and, inArray } from 'drizzle-orm'
import { RecusaUsuario } from '@/lib/resultado-action'
import { daContaDaLoja } from '@/lib/pecas-da-conta'
import { moverSaldo } from '@/lib/estoque-pecas-loja'
import { recusaDaQuantidadeVendida } from '@/lib/quantidade-vendida'
import { conferirMaquininhas } from '@/lib/maquininhas'

// `valorUnitario` sobrepõe o preço do catálogo só naquela venda (desconto/ajuste de
// balcão). Só gestor pode mandar — quem decide é o servidor, não o cliente; ver
// registrarVendaPecaAction.
export type ItemVendaPecaInput = { pecaId: string; quantidade: number; valorUnitario?: number }
export type PagamentoVendaPecaInput = { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }
export type DadosVendaPeca = {
  lojaId: string
  clienteNome?: string
  /** 'fisica' (padrão) ou 'juridica'. Jurídica é o que faz o recibo sair no CNPJ. */
  clienteTipoPessoa?: string
  /** CPF/CNPJ só com dígitos. Obrigatório quando `clienteTipoPessoa` é 'juridica'. */
  clienteDocumento?: string | null
  itens: ItemVendaPecaInput[]
  pagamentos: PagamentoVendaPecaInput[]
}

// Cria a venda de fato, sem checagem de permissão: quem chama confere antes (fechamento
// direto e aprovação de pagamento sensível). Fora de arquivo 'use server' de propósito:
// lá, função exportada vira endpoint que qualquer usuário chama direto (#328). Recebe a transação de
// fora pra poder ficar atômico com o UPDATE de aprovação (ver aprovarVendaAction).
export async function aplicarVendaPeca(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  vendedorId: string,
  input: DadosVendaPeca,
) {
  const valorTotal = input.pagamentos.reduce((s, p) => s + p.valor, 0)

  const pecaIds = input.itens.map(i => i.pecaId)
  const pecas = await tx
    .select({ id: pecasCatalogo.id, nome: pecasCatalogo.nome, valor: pecasCatalogo.valor })
    .from(pecasCatalogo)
    // Peça de outra Conta fica de fora e cai no "Peça não encontrada" abaixo (#195).
    .where(and(inArray(pecasCatalogo.id, pecaIds), daContaDaLoja(input.lojaId)))
    .for('update')
  const pecaById = new Map(pecas.map(p => [p.id, p]))

  // Estoque NÃO barra a venda (decisão do Cesar em 31/08/2026). O catálogo veio da
  // fábrica com 1.732 das 1.733 peças zeradas, então a trava reprovava toda venda de
  // balcão — nenhuma chegou a ser registrada. A contagem segue sendo atualizada e pode
  // ficar negativa: é indicador de que falta lançar entrada, não impedimento de vender.
  // A tela já mostra o saldo em vermelho quando está zerado ou negativo.
  // Também aqui, e não só na action: a aprovação de venda guardada chega direto (#195).
  const recusaQuantidade = recusaDaQuantidadeVendida(input.itens)
  if (recusaQuantidade) throw new RecusaUsuario(recusaQuantidade)
  await conferirMaquininhas(tx, input.lojaId, input.pagamentos)
  for (const item of input.itens) {
    const peca = pecaById.get(item.pecaId)
    if (!peca) throw new RecusaUsuario('Peça não encontrada')
    if (item.quantidade <= 0) throw new RecusaUsuario(`Quantidade inválida para ${peca.nome}`)
  }

  const formaPagamento = input.pagamentos.length === 1 ? input.pagamentos[0].tipo : 'multiplo'

  const [venda] = await tx.insert(vendasPecas).values({
    lojaId: input.lojaId,
    vendedorId,
    clienteNome: input.clienteNome?.trim() || null,
    // Já chega validado por registrarVendaPecaAction — aqui é só gravação.
    clienteTipoPessoa: input.clienteTipoPessoa === 'juridica' ? 'juridica' : 'fisica',
    clienteDocumento: input.clienteDocumento || null,
    formaPagamento,
    pagamentos: input.pagamentos,
    valorTotal: valorTotal.toFixed(2),
  }).returning({ id: vendasPecas.id })

  for (const item of input.itens) {
    const peca = pecaById.get(item.pecaId)!
    // O `valorUnitario` já chega saneado por registrarVendaPecaAction: quem não pode
    // mexer no preço não tem esse campo aqui. Ausente = preço do catálogo.
    const valorUnitario = item.valorUnitario != null && item.valorUnitario >= 0
      ? item.valorUnitario.toFixed(2)
      : peca.valor
    await tx.insert(vendasPecasItens).values({
      vendaPecaId: venda.id,
      pecaId: item.pecaId,
      descricao: peca.nome,
      quantidade: String(item.quantidade),
      valorUnitario,
    })
    await moverSaldo(tx, item.pecaId, input.lojaId, -item.quantidade)
  }

  return { id: venda.id }
}

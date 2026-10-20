/**
 * Regras puras da edição de venda de peças (#242): o que muda no estoque, o
 * texto que fica no histórico e os avisos antes de salvar. A transação que
 * aplica isso fica em ./editar-venda-peca.
 */
import { hojeBrt } from './data-venda'

type ItemQtd = { pecaId: string; quantidade: number }

function somaPorPeca(itens: ItemQtd[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const i of itens) m.set(i.pecaId, (m.get(i.pecaId) ?? 0) + i.quantidade)
  return m
}

/**
 * Quanto baixar de cada peça: positivo baixa mais, negativo devolve. Mesma
 * conta de excluir a venda e lançar de novo, sem mexer em peça que não mudou.
 */
export function diferencaDeEstoque(antes: ItemQtd[], depois: ItemQtd[]): Map<string, number> {
  const a = somaPorPeca(antes)
  const d = somaPorPeca(depois)
  const delta = new Map<string, number>()
  for (const id of new Set([...a.keys(), ...d.keys()])) {
    const n = (d.get(id) ?? 0) - (a.get(id) ?? 0)
    if (n !== 0) delta.set(id, n)
  }
  return delta
}

type Retrato = { itens: { descricao: string; quantidade: number }[]; formaPagamento: string; valorTotal: number }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

export function resumoDaEdicao(antes: Retrato, depois: Retrato): string {
  const qtd = (r: Retrato) => {
    const m = new Map<string, number>()
    for (const i of r.itens) m.set(i.descricao, (m.get(i.descricao) ?? 0) + i.quantidade)
    return m
  }
  const a = qtd(antes)
  const d = qtd(depois)
  const linhas: string[] = []
  for (const [nome, q] of d) {
    if (!a.has(nome)) linhas.push(`+ ${nome} (${q})`)
    else if (a.get(nome) !== q) linhas.push(`${nome}: ${a.get(nome)} → ${q}`)
  }
  for (const nome of a.keys()) if (!d.has(nome)) linhas.push(`- ${nome}`)
  if (antes.formaPagamento !== depois.formaPagamento) linhas.push(`Pagamento: ${antes.formaPagamento} → ${depois.formaPagamento}`)
  if (Math.abs(antes.valorTotal - depois.valorTotal) >= 0.005) linhas.push(`Total: ${brl(antes.valorTotal)} → ${brl(depois.valorTotal)}`)
  return linhas.length ? linhas.join('\n') : 'Sem mudança nos itens ou pagamentos'
}

/** Avisa, não bloqueia: a edição segue mesmo com os dois casos. */
export function avisosDaEdicao(v: { conciliada: boolean; dataVenda: Date; agora?: Date }): string[] {
  const avisos: string[] = []
  if (v.conciliada) {
    avisos.push('Esta venda está ligada a um recebimento na conciliação (cartão ou PIX). Se o valor mudar, refaça a conciliação.')
  }
  if (hojeBrt(v.dataVenda).slice(0, 7) < hojeBrt(v.agora).slice(0, 7)) {
    avisos.push('Venda de mês anterior: a edição muda o DRE e a comissão desse mês.')
  }
  return avisos
}

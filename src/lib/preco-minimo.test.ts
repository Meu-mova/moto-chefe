import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcLiquidoRecebido, validarPrecoVenda, type TaxasVenda } from './preco-minimo'

// Taxas no formato do banco (configuracao_taxas): fração, não percentual.
const TAXAS: TaxasVenda = {
  taxasCartao: { '1': 0.0399, '8': 0.0916, '12': 0.1215 },
  taxasDebito: { '1': 0.0139 },
  taxasLink: { '12': 0.1499 },
  taxasFinanciamento: { '1': 0.05 },
}

test('pix, dinheiro e transferência entram integrais — não têm taxa', () => {
  assert.equal(calcLiquidoRecebido([{ tipo: 'pix', valor: 10490 }], TAXAS), 10490)
  assert.equal(calcLiquidoRecebido([{ tipo: 'dinheiro', valor: 500 }], TAXAS), 500)
  assert.equal(calcLiquidoRecebido([{ tipo: 'transferencia', valor: 8000 }], TAXAS), 8000)
})

test('cartão de crédito desconta a taxa da parcela — divide, não multiplica', () => {
  // 10908 em 12x a 12,15%: o bruto embute a taxa, então o líquido é 10908 / 1,1215.
  const liquido = calcLiquidoRecebido([{ tipo: 'cartao_credito', valor: 10908, parcelas: 12 }], TAXAS)
  assert.ok(Math.abs(liquido - 10908 / 1.1215) < 0.01)
  assert.ok(liquido < 10908)
})

test('cada parcela usa a sua própria taxa', () => {
  const um = calcLiquidoRecebido([{ tipo: 'cartao_credito', valor: 10000, parcelas: 1 }], TAXAS)
  const doze = calcLiquidoRecebido([{ tipo: 'cartao_credito', valor: 10000, parcelas: 12 }], TAXAS)
  assert.ok(um > doze)
})

test('débito usa sempre a taxa de 1x, mesmo sem parcelas informadas', () => {
  const liquido = calcLiquidoRecebido([{ tipo: 'cartao_debito', valor: 1000 }], TAXAS)
  assert.ok(Math.abs(liquido - 1000 / 1.0139) < 0.01)
})

test('parcela sem taxa cadastrada passa integral em vez de zerar', () => {
  // 6x não está na tabela: melhor creditar o bruto do que inventar desconto.
  assert.equal(calcLiquidoRecebido([{ tipo: 'cartao_credito', valor: 5000, parcelas: 6 }], TAXAS), 5000)
})

test('cartão sem parcelas vira 0 — é o gatilho do aviso, não um líquido de verdade', () => {
  assert.equal(calcLiquidoRecebido([{ tipo: 'cartao_credito', valor: 9990 }], TAXAS), 0)
  assert.equal(calcLiquidoRecebido([{ tipo: 'link_pagamento', valor: 9990 }], TAXAS), 0)
})

test('financiamento não tem taxa — está no conjunto SEM_TAXA', () => {
  // A taxa de financiamento existe na configuração, mas o tipo sai antes de chegar nela.
  assert.equal(calcLiquidoRecebido([{ tipo: 'financiamento', valor: 12000, parcelas: 1 }], TAXAS), 12000)
})

test('pagamento misto soma o líquido de cada parte', () => {
  const pagamentos = [
    { tipo: 'dinheiro', valor: 2000 },
    { tipo: 'cartao_credito', valor: 6634.88, parcelas: 8 },
  ]
  const esperado = 2000 + 6634.88 / 1.0916
  assert.ok(Math.abs(calcLiquidoRecebido(pagamentos, TAXAS) - esperado) < 0.01)
})

test('validarPrecoVenda: déficit é o que falta pro mínimo — o desconto que será gravado', () => {
  const r = validarPrecoVenda([{ tipo: 'pix', valor: 9990 }], 10490, TAXAS)
  assert.equal(r.valido, false)
  assert.equal(r.liquido, 9990)
  assert.equal(r.deficit, 500)
})

test('validarPrecoVenda: venda no mínimo passa e não gera déficit', () => {
  const r = validarPrecoVenda([{ tipo: 'pix', valor: 10490 }], 10490, TAXAS)
  assert.equal(r.valido, true)
  assert.equal(r.deficit, 0)
})

test('validarPrecoVenda: acima do mínimo o déficit não fica negativo', () => {
  const r = validarPrecoVenda([{ tipo: 'pix', valor: 12000 }], 10490, TAXAS)
  assert.equal(r.valido, true)
  assert.equal(r.deficit, 0)
})

test('validarPrecoVenda: cartão pode reprovar mesmo com bruto acima do mínimo', () => {
  // 10908 > 10490, mas a taxa de 12x derruba o líquido pra baixo do piso.
  const r = validarPrecoVenda([{ tipo: 'cartao_credito', valor: 10908, parcelas: 12 }], 10490, TAXAS)
  assert.equal(r.valido, false)
  assert.ok(r.deficit > 0)
})

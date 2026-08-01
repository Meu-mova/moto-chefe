import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularResultadoPorLoja, type VendasDaLoja } from './resultado-por-loja'

const loja = (over: Partial<VendasDaLoja> & { lojaId: string }): VendasDaLoja => ({
  lojaNome: over.lojaId,
  qtdVendas: 1,
  receitaBruta: 0,
  receitaLiquida: 0,
  custoMotos: 0,
  qtdSemCusto: 0,
  ...over,
})

test('lucro bruto é receita líquida menos custo das motos', () => {
  const r = calcularResultadoPorLoja(
    [loja({ lojaId: 'a', receitaBruta: 100_000, receitaLiquida: 96_000, custoMotos: 60_000 })],
    new Map(),
    0,
  )
  assert.equal(r.lojas[0].lucroBruto, 36_000)
})

test('imposto incide sobre a receita BRUTA, não sobre a líquida', () => {
  const r = calcularResultadoPorLoja(
    [loja({ lojaId: 'a', receitaBruta: 100_000, receitaLiquida: 90_000, custoMotos: 0 })],
    new Map(),
    0.06,
  )
  assert.equal(r.lojas[0].imposto, 6_000)
})

test('despesa própria da loja entra inteira', () => {
  const r = calcularResultadoPorLoja(
    [loja({ lojaId: 'a', receitaBruta: 100_000, receitaLiquida: 100_000, custoMotos: 0 })],
    new Map([['a', 8_000]]),
    0,
  )
  assert.equal(r.lojas[0].despesaPropria, 8_000)
  assert.equal(r.lojas[0].lucroLiquido, 92_000)
})

// ── rateio da despesa sem loja ───────────────────────────────────────────────

test('despesa sem loja é rateada na proporção do faturamento', () => {
  const r = calcularResultadoPorLoja(
    [
      loja({ lojaId: 'grande', receitaBruta: 750_000, receitaLiquida: 750_000 }),
      loja({ lojaId: 'pequena', receitaBruta: 250_000, receitaLiquida: 250_000 }),
    ],
    new Map([[null, 100_000]]),
    0,
  )
  assert.equal(r.lojas[0].despesaRateada, 75_000)
  assert.equal(r.lojas[1].despesaRateada, 25_000)
})

test('o rateio distribui a despesa geral inteira, sem sobra', () => {
  const r = calcularResultadoPorLoja(
    [
      loja({ lojaId: 'a', receitaBruta: 333_333 }),
      loja({ lojaId: 'b', receitaBruta: 333_333 }),
      loja({ lojaId: 'c', receitaBruta: 333_334 }),
    ],
    new Map([[null, 100_000]]),
    0,
  )
  const rateado = r.lojas.reduce((a, l) => a + l.despesaRateada, 0)
  assert.ok(Math.abs(rateado - 100_000) < 0.0001, `rateou ${rateado}`)
})

test('loja que não vendeu nada não carrega rateio', () => {
  const r = calcularResultadoPorLoja(
    [
      loja({ lojaId: 'vendeu', receitaBruta: 100_000, receitaLiquida: 100_000 }),
      loja({ lojaId: 'parada', qtdVendas: 0, receitaBruta: 0 }),
    ],
    new Map([[null, 50_000]]),
    0,
  )
  assert.equal(r.lojas[1].despesaRateada, 0)
  assert.equal(r.lojas[0].despesaRateada, 50_000)
})

test('mês sem faturamento nenhum divide a despesa geral em partes iguais', () => {
  // Sem essa saída a despesa geral sumiria da tabela e o total não fecharia
  // com o card de despesas do topo da página.
  const r = calcularResultadoPorLoja(
    [loja({ lojaId: 'a', qtdVendas: 0 }), loja({ lojaId: 'b', qtdVendas: 0 })],
    new Map([[null, 10_000]]),
    0,
  )
  assert.equal(r.lojas[0].despesaRateada, 5_000)
  assert.equal(r.lojas[1].despesaRateada, 5_000)
})

test('sem loja nenhuma não estoura divisão por zero', () => {
  const r = calcularResultadoPorLoja([], new Map([[null, 10_000]]), 0.06)
  assert.deepEqual(r.lojas, [])
  assert.equal(r.totais.lucroLiquido, 0)
  assert.equal(r.totais.margem, null)
})

// ── margem ───────────────────────────────────────────────────────────────────

test('margem é o lucro líquido sobre a receita bruta, em %', () => {
  const r = calcularResultadoPorLoja(
    [loja({ lojaId: 'a', receitaBruta: 100_000, receitaLiquida: 100_000, custoMotos: 80_000 })],
    new Map(),
    0,
  )
  assert.equal(r.lojas[0].margem, 20)
})

test('loja sem venda tem margem null, não 0% nem NaN', () => {
  const r = calcularResultadoPorLoja([loja({ lojaId: 'a', qtdVendas: 0 })], new Map(), 0.06)
  assert.equal(r.lojas[0].margem, null)
})

test('prejuízo aparece como lucro negativo', () => {
  const r = calcularResultadoPorLoja(
    [loja({ lojaId: 'a', receitaBruta: 10_000, receitaLiquida: 10_000, custoMotos: 9_000 })],
    new Map([['a', 5_000]]),
    0.06,
  )
  assert.equal(r.lojas[0].lucroLiquido, 10_000 - 9_000 - 5_000 - 600)
  assert.ok(r.lojas[0].lucroLiquido < 0)
})

// ── totais ───────────────────────────────────────────────────────────────────

test('totais somam as lojas e a despesa geral aparece inteira', () => {
  const r = calcularResultadoPorLoja(
    [
      loja({ lojaId: 'a', receitaBruta: 200_000, receitaLiquida: 190_000, custoMotos: 120_000, qtdVendas: 10 }),
      loja({ lojaId: 'b', receitaBruta: 100_000, receitaLiquida: 95_000, custoMotos: 55_000, qtdVendas: 5 }),
    ],
    new Map([['a', 10_000], [null, 30_000]]),
    0.06,
  )
  assert.equal(r.totais.receitaBruta, 300_000)
  assert.equal(r.totais.custoMotos, 175_000)
  assert.equal(r.totais.despesa, 40_000)          // 10.000 da loja a + 30.000 rateados
  assert.equal(r.totais.imposto, 18_000)
  assert.equal(r.totais.lucroBruto, 110_000)      // 285.000 − 175.000
  assert.equal(r.totais.lucroLiquido, 52_000)     // 110.000 − 40.000 − 18.000
  assert.equal(r.despesaGeralRateada, 30_000)
})

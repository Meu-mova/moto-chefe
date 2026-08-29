import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularResultadoPorLoja } from './resultado-por-loja'
import { despesaDaLojaFiltrada, CATEGORIA_RATEIO } from './despesa-loja-filtrada'
import type { TotalDespesas } from './despesas-operacionais'

// Números reais do Sul de Minas em agosto/2026, que foi como o problema apareceu:
// o card filtrado por Itajubá mostrava R$ 306.041,09 (a despesa própria da loja MAIS
// os R$ 264.458,57 da estrutura inteira da empresa), enquanto a tabela de resultado
// por loja mostrava R$ 102.474,92 pra mesma loja no mesmo mês.
const ITAJUBA = 'itajuba'
const POUSO = 'pouso'

const vendas = [
  { lojaId: ITAJUBA, lojaNome: 'Itajuba', qtdVendas: 10, receitaBruta: 478_000, receitaLiquida: 470_000, custoMotos: 300_000, qtdSemCusto: 0 },
  { lojaId: POUSO, lojaNome: 'Pouso Alegre', qtdVendas: 12, receitaBruta: 570_000, receitaLiquida: 560_000, custoMotos: 350_000, qtdSemCusto: 0 },
]

function resumoDe(porLoja: Map<string | null, number>, porCategoriaPorLoja: Map<string, { categoria: string; total: number }[]>): TotalDespesas {
  return {
    total: [...porLoja.values()].reduce((a, b) => a + b, 0),
    porCategoria: [],
    foraDoCalculo: { compra_moto: 0, retirada_socio: 0, categoria_marcada: 0, transferencia_interna: 0, caixa_nao_despesa: 0, estorno_cliente: 0, ja_lancada_manual: 0 },
    porLoja,
    porCategoriaGeral: [],
    porCategoriaPorLoja,
    foraPorCategoria: [],
  }
}

test('a loja filtrada carrega só a fatia rateada da estrutura, não a estrutura inteira', () => {
  const porLoja = new Map<string | null, number>([[ITAJUBA, 41_582.52], [POUSO, 81_537.31], [null, 264_458.57]])
  const resultado = calcularResultadoPorLoja(vendas, porLoja)
  const visao = despesaDaLojaFiltrada(resumoDe(porLoja, new Map()), resultado, ITAJUBA)

  assert.equal(visao.propria, 41_582.52)
  // 478.000 / 1.048.000 = 45,6107% de 264.458,57
  assert.ok(Math.abs(visao.rateada - 120_621.37) < 0.01, `rateada=${visao.rateada}`)
  assert.ok(Math.abs(visao.total - (visao.propria + visao.rateada)) < 0.001)
  // O que NÃO pode acontecer de novo: a loja levar a geral inteira.
  assert.notEqual(Math.round(visao.total), Math.round(41_582.52 + 264_458.57))
})

test('o detalhamento soma exatamente o card', () => {
  const porLoja = new Map<string | null, number>([[ITAJUBA, 41_582.52], [POUSO, 81_537.31], [null, 264_458.57]])
  const categorias = new Map([[ITAJUBA, [
    { categoria: 'Salários', total: 30_000 },
    { categoria: 'Aluguel', total: 11_582.52 },
  ]]])
  const resultado = calcularResultadoPorLoja(vendas, porLoja)
  const visao = despesaDaLojaFiltrada(resumoDe(porLoja, categorias), resultado, ITAJUBA)

  const somaLista = visao.porCategoria.reduce((a, c) => a + c.total, 0)
  assert.ok(Math.abs(somaLista - visao.total) < 0.01, `lista=${somaLista} card=${visao.total}`)
  assert.equal(visao.porCategoria[0].categoria, CATEGORIA_RATEIO)
  assert.equal(visao.porCategoria.length, 3)
})

test('sem despesa de estrutura não aparece linha de rateio', () => {
  const porLoja = new Map<string | null, number>([[ITAJUBA, 41_582.52]])
  const resultado = calcularResultadoPorLoja(vendas, porLoja)
  const visao = despesaDaLojaFiltrada(resumoDe(porLoja, new Map([[ITAJUBA, [{ categoria: 'Salários', total: 41_582.52 }]]])), resultado, ITAJUBA)

  assert.equal(visao.rateada, 0)
  assert.equal(visao.total, 41_582.52)
  assert.deepEqual(visao.porCategoria.map(c => c.categoria), ['Salários'])
})

test('loja que não está no resultado fica com a despesa própria e rateio zero', () => {
  const porLoja = new Map<string | null, number>([['galpao', 6_181.27], [null, 264_458.57]])
  const resultado = calcularResultadoPorLoja(vendas, porLoja)
  const visao = despesaDaLojaFiltrada(resumoDe(porLoja, new Map()), resultado, 'galpao')

  assert.equal(visao.propria, 6_181.27)
  assert.equal(visao.rateada, 0)
  assert.equal(visao.total, 6_181.27)
})

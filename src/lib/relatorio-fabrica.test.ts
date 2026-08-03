import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorModelo, lojaEntraNoRelatorioFabrica, type LinhaModeloLoja } from './relatorio-fabrica'

const GALPAO = 'f154c1a5-c5ed-4bdc-af14-b1dea024beae'
const LAVRAS = 'd27be175-1a99-4382-a335-7a027195922e'
const VARGINHA = '44351a40-b800-47af-9e31-af4621b6cbc1'

test('Galpão Matriz e Lavras ficam fora do relatório', () => {
  assert.equal(lojaEntraNoRelatorioFabrica(GALPAO), false)
  assert.equal(lojaEntraNoRelatorioFabrica(LAVRAS), false)
})

test('as demais lojas entram', () => {
  assert.equal(lojaEntraNoRelatorioFabrica(VARGINHA), true)
})

const linha = (modeloId: string, modelo: string, lojaNome: string, quantidade: number, valor: number): LinhaModeloLoja =>
  ({ modeloId, marca: 'Shineray', modelo, lojaId: 'x', lojaNome, quantidade, valor })

test('soma quantidade e valor do modelo entre as lojas', () => {
  const [g] = agruparPorModelo([
    linha('m1', 'SHI 175', 'Varginha', 3, 30000),
    linha('m1', 'SHI 175', 'Itajuba', 2, 21000),
  ])
  assert.equal(g.quantidade, 5)
  assert.equal(g.valor, 51000)
  assert.equal(g.lojas.length, 2)
})

test('lista as lojas do modelo em ordem alfabética', () => {
  const [g] = agruparPorModelo([
    linha('m1', 'SHI 175', 'Varginha', 1, 10000),
    linha('m1', 'SHI 175', 'Itajuba', 1, 10000),
  ])
  assert.deepEqual(g.lojas.map(l => l.lojaNome), ['Itajuba', 'Varginha'])
})

test('modelo que mais vendeu vem primeiro', () => {
  const gs = agruparPorModelo([
    linha('m1', 'Pouco vendido', 'Varginha', 1, 10000),
    linha('m2', 'Campeão', 'Varginha', 9, 90000),
  ])
  assert.deepEqual(gs.map(g => g.modelo), ['Campeão', 'Pouco vendido'])
})

test('empate na quantidade desempata pelo nome do modelo', () => {
  const gs = agruparPorModelo([
    linha('m1', 'Zebra', 'Varginha', 2, 1),
    linha('m2', 'Alfa', 'Varginha', 2, 1),
  ])
  assert.deepEqual(gs.map(g => g.modelo), ['Alfa', 'Zebra'])
})

test('sem vendas, sem linhas', () => {
  assert.deepEqual(agruparPorModelo([]), [])
})

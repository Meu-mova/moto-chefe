import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorLoja, lojaEntraNoRelatorioFabrica, type LinhaModeloLoja } from './relatorio-fabrica'

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

const linha = (lojaId: string, lojaNome: string, modelo: string, quantidade: number, valor: number): LinhaModeloLoja =>
  ({ modeloId: modelo, marca: 'Shineray', modelo, lojaId, lojaNome, quantidade, valor })

test('soma quantidade e valor da loja entre os modelos', () => {
  const [g] = agruparPorLoja([
    linha('l1', 'Varginha', 'SHI 175', 3, 30000),
    linha('l1', 'Varginha', 'SHI 50', 2, 21000),
  ])
  assert.equal(g.quantidade, 5)
  assert.equal(g.valor, 51000)
  assert.equal(g.modelos.length, 2)
})

test('separa uma loja da outra', () => {
  const gs = agruparPorLoja([
    linha('l1', 'Varginha', 'SHI 175', 1, 10000),
    linha('l2', 'Itajuba', 'SHI 175', 1, 10000),
  ])
  assert.equal(gs.length, 2)
  assert.deepEqual([...gs.map(g => g.lojaNome)].sort(), ['Itajuba', 'Varginha'])
})

test('loja que mais vendeu vem primeiro', () => {
  const gs = agruparPorLoja([
    linha('l1', 'Pouco vendeu', 'SHI 175', 1, 10000),
    linha('l2', 'Campeã', 'SHI 175', 9, 90000),
  ])
  assert.deepEqual(gs.map(g => g.lojaNome), ['Campeã', 'Pouco vendeu'])
})

test('dentro da loja, o modelo que mais vendeu vem primeiro', () => {
  const [g] = agruparPorLoja([
    linha('l1', 'Varginha', 'Pouco vendido', 1, 10000),
    linha('l1', 'Varginha', 'Campeão', 9, 90000),
  ])
  assert.deepEqual(g.modelos.map(m => m.modelo), ['Campeão', 'Pouco vendido'])
})

test('empate na quantidade desempata pelo nome da loja', () => {
  const gs = agruparPorLoja([
    linha('l1', 'Zebra', 'SHI 175', 2, 1),
    linha('l2', 'Alfa', 'SHI 175', 2, 1),
  ])
  assert.deepEqual(gs.map(g => g.lojaNome), ['Alfa', 'Zebra'])
})

test('sem vendas, sem linhas', () => {
  assert.deepEqual(agruparPorLoja([]), [])
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorModelo } from './showroom-impressao'

const moto = (modelo: string, chassi: string, marca = 'MotoChefe') => ({ modelo, marca, chassi, cor: 'PRETO', status: 'caixa' as const, lojaNome: 'Loja' })

test('agrupa por modelo com quantidade, subtotal e total', () => {
  const precos = new Map([['C1', '5200.00'], ['C2', '5200'], ['C3', '6900.50']])
  const r = agruparPorModelo([moto('GIGA', 'C1'), moto('X12', 'C3'), moto('GIGA', 'C2')], precos)
  assert.deepEqual(r.grupos.map(g => [g.modelo, g.quantidade, g.subtotal]), [['GIGA', 2, 10400], ['X12', 1, 6900.5]])
  assert.equal(r.grupos[0].motos[0].preco, 5200)
  assert.deepEqual([r.quantidade, r.total], [3, 17300.5])
})

test('sem preços (quem não é sócio): nenhum valor no resultado', () => {
  const r = agruparPorModelo([moto('GIGA', 'C1')], null)
  assert.equal(r.total, null)
  assert.equal(r.grupos[0].subtotal, null)
  assert.equal(r.grupos[0].motos[0].preco, null)
})

test('mesmo nome em marcas diferentes fica separado', () => {
  const r = agruparPorModelo([moto('X12', 'C1', 'MotoChefe'), moto('X12', 'C2', 'Outra')], null)
  assert.equal(r.grupos.length, 2)
})

test('moto sem preço de compra não vira R$ 0 calado: conta quantas ficaram fora da soma', () => {
  const precos = new Map<string, string | null>([['C1', '5200'], ['C2', null]])
  const r = agruparPorModelo([moto('GIGA', 'C1'), moto('GIGA', 'C2'), moto('X12', 'C3')], precos)
  assert.equal(r.comValores, true)
  assert.deepEqual(r.grupos.map(g => [g.modelo, g.subtotal, g.semPreco]), [['GIGA', 5200, 1], ['X12', 0, 1]])
  assert.equal(r.grupos[0].motos[1].preco, null)
  assert.deepEqual([r.total, r.semPreco], [5200, 2])
})

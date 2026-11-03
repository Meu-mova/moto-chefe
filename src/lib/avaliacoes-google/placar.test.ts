// Conta da meta do placar: arredonda para cima e não inventa percentual.
import test from 'node:test'
import assert from 'node:assert/strict'
import { progressoMeta } from './placar'

test('80% de 19 vendas são 16: 15 ficaria em 78,9%', () => {
  assert.deepEqual(progressoMeta(0, 19, 80), { pct: 0, faltam: 16 })
  assert.deepEqual(progressoMeta(15, 19, 80), { pct: 79, faltam: 1 })
  assert.deepEqual(progressoMeta(16, 19, 80), { pct: 84, faltam: 0 })
})

test('passar da meta não vira falta negativa', () => {
  assert.deepEqual(progressoMeta(30, 10, 80), { pct: 300, faltam: 0 })
})

test('sem venda no mês não há percentual nem falta', () => {
  assert.deepEqual(progressoMeta(5, 0, 80), { pct: null, faltam: 0 })
})

test('sem leitura do total: percentual desconhecido, não zero', () => {
  assert.deepEqual(progressoMeta(null, 10, 80), { pct: null, faltam: 8 })
})

test('usa a meta do grupo', () => {
  assert.equal(progressoMeta(0, 10, 50).faltam, 5)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar } from './texto'

test('minúsculas e sem acento', () => {
  assert.equal(normalizar('Vendas HOJE'), 'vendas hoje')
  assert.equal(normalizar('Ranking de Vendedôres'), 'ranking de vendedores')
})

test('colapsa espaços e apara', () => {
  assert.equal(normalizar('  vendas   por  loja '), 'vendas por loja')
})

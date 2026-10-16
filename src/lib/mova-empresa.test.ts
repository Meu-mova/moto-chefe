import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precoSugerido } from './mova-empresa'

test('precoSugerido: padrão 999/499 e franqueado MotoChefe 799/399', () => {
  assert.deepEqual(precoSugerido(false), { implantacao: 999, mensalidade: 499 })
  assert.deepEqual(precoSugerido(true), { implantacao: 799, mensalidade: 399 })
})

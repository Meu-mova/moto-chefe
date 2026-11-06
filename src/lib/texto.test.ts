import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, plural, semZerosAEsquerda } from './texto'

test('minusculas, sem acento, espacos colapsados', () => {
  assert.equal(normalizar('  Ática   ROSA  '), 'atica rosa')
})

test('string nula vira vazia', () => {
  assert.equal(normalizar(undefined as unknown as string), '')
})

test('sem zeros à esquerda: "0974" e "974" viram o mesmo texto; só zeros vira "0"', () => {
  assert.equal(semZerosAEsquerda('0974'), '974')
  assert.equal(semZerosAEsquerda('974'), '974')
  assert.equal(semZerosAEsquerda('000'), '0')
  assert.equal(semZerosAEsquerda(' 001 '), '1')
  assert.equal(semZerosAEsquerda(null), '')
  assert.equal(semZerosAEsquerda(''), '')
})

test('plural: singular só para 1', () => {
  assert.equal(plural(1, 'moto', 'motos'), '1 moto')
  assert.equal(plural(2, 'moto', 'motos'), '2 motos')
  assert.equal(plural(0, 'moto', 'motos'), '0 motos')
})

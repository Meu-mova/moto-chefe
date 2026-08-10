import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar } from './texto'

test('minusculas, sem acento, espacos colapsados', () => {
  assert.equal(normalizar('  Ática   ROSA  '), 'atica rosa')
})

test('string nula vira vazia', () => {
  assert.equal(normalizar(undefined as unknown as string), '')
})

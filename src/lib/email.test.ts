import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailValido } from './email'

test('aceita e-mail normal', () => {
  assert.equal(emailValido('cliente@gmail.com'), true)
  assert.equal(emailValido(' cliente@meumova.com '), true)
})

test('rejeita vazio, nulo e lixo', () => {
  assert.equal(emailValido(''), false)
  assert.equal(emailValido(null), false)
  assert.equal(emailValido(undefined), false)
  assert.equal(emailValido('não informado'), false)
  assert.equal(emailValido('cliente@'), false)
  assert.equal(emailValido('cliente@dominio'), false)
  assert.equal(emailValido('cliente sem arroba'), false)
})

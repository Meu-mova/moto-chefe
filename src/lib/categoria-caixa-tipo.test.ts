import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serveAoLancamento, tiposDeCategoriaPara, tiposDeLancamentoDa, tiposQueRepetem } from './categoria-caixa-tipo'

test('"ambos" atende entrada e saída; entrada e saída atendem só a si', () => {
  assert.deepEqual(tiposDeLancamentoDa('ambos'), ['entrada', 'saida'])
  assert.deepEqual(tiposDeLancamentoDa('entrada'), ['entrada'])
  assert.deepEqual(tiposDeLancamentoDa('saida'), ['saida'])
  assert.deepEqual(tiposDeLancamentoDa('outro'), [])
})

test('lançamento de saída usa categoria de saída ou ambos, nunca de entrada', () => {
  assert.equal(serveAoLancamento('saida', 'saida'), true)
  assert.equal(serveAoLancamento('ambos', 'saida'), true)
  assert.equal(serveAoLancamento('entrada', 'saida'), false)
  assert.deepEqual(tiposDeCategoriaPara('saida'), ['saida', 'ambos'])
  assert.deepEqual(tiposDeCategoriaPara('entrada'), ['entrada', 'ambos'])
})

test('nome repetido: entrada e saída não se repetem; ambos repete os dois', () => {
  assert.deepEqual(tiposQueRepetem('entrada'), ['entrada', 'ambos'])
  assert.deepEqual(tiposQueRepetem('saida'), ['saida', 'ambos'])
  assert.deepEqual(tiposQueRepetem('ambos'), ['entrada', 'saida', 'ambos'])
})

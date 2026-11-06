import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDaSelecao, marcarVarias } from './selecao'

test('estadoDaSelecao: nenhuma, parte ou todas do grupo marcadas', () => {
  assert.equal(estadoDaSelecao([1, 2, 3], new Set([9])), 'nenhuma')
  assert.equal(estadoDaSelecao([1, 2, 3], new Set([2, 9])), 'parte')
  assert.equal(estadoDaSelecao([1, 2, 3], new Set([1, 2, 3, 9])), 'todas')
})

test('estadoDaSelecao: grupo vazio conta como nenhuma', () => {
  assert.equal(estadoDaSelecao([], new Set([1])), 'nenhuma')
})

test('marcarVarias liga ou desliga só os ids do grupo e não mexe no conjunto de entrada', () => {
  const antes = new Set([1, 9])
  assert.deepEqual([...marcarVarias(antes, [1, 2], true)].sort(), [1, 2, 9])
  assert.deepEqual([...marcarVarias(antes, [1, 2], false)], [9])
  assert.deepEqual([...antes].sort(), [1, 9])
})

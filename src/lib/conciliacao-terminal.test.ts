import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extrairTerminalInfinityPay, padraoNsuDoTerminal } from './conciliacao-terminal'

test('extrai o serial do formato do relatório', () => {
  assert.equal(extrairTerminalInfinityPay('NS: PB1F254M76675'), 'PB1F254M76675')
})

test('tolera falta de espaço depois dos dois pontos', () => {
  assert.equal(extrairTerminalInfinityPay('NS:PB1F254M76675'), 'PB1F254M76675')
})

test('campo vazio ou ausente não quebra', () => {
  assert.equal(extrairTerminalInfinityPay(''), null)
  assert.equal(extrairTerminalInfinityPay(undefined), null)
})

test('texto sem NS não inventa serial', () => {
  assert.equal(extrairTerminalInfinityPay('Maquininha'), null)
})

test('o serial extraído casa com o NSU da mesma transação', () => {
  const terminal = extrairTerminalInfinityPay('NS: PB1F254M76675')
  const nsu = 'SPB1F254M7667522050320260730170001'
  assert.ok(terminal && nsu.includes(terminal))
  assert.equal(padraoNsuDoTerminal(terminal), '%PB1F254M76675%')
})

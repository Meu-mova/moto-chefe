import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarChamadaEnvio, avaliarEnvio } from './client'

test('monta a chamada tools/call de whatsapp_send_text', () => {
  const corpo = montarChamadaEnvio('5535999999999', 'oi')
  assert.deepEqual(corpo, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'whatsapp_send_text', arguments: { to: '5535999999999', text: 'oi' } },
  })
})

test('avaliarEnvio: json com error vira erro', () => {
  const resultado = avaliarEnvio({ error: { message: 'deu ruim' } })
  assert.equal(resultado, 'erro')
})

test('avaliarEnvio: result.isError vira erro', () => {
  const resultado = avaliarEnvio({ result: { isError: true, content: [{ text: 'conta não pareada' }] } })
  assert.equal(resultado, 'erro')
})

test('avaliarEnvio: result normal vira enviado', () => {
  const resultado = avaliarEnvio({ result: { content: [{ text: 'ok' }] } })
  assert.equal(resultado, 'enviado')
})

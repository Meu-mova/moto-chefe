import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarChamadaEnvio } from './client'

test('monta a chamada tools/call de whatsapp_send_text', () => {
  const corpo = montarChamadaEnvio('5535999999999', 'oi')
  assert.deepEqual(corpo, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'whatsapp_send_text', arguments: { to: '5535999999999', text: 'oi' } },
  })
})

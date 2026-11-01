import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ipDoPedido } from './ip-do-pedido'

test('primeiro IP do x-forwarded-for é o cliente; os outros são proxies', () => {
  assert.equal(ipDoPedido(new Headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' })), '203.0.113.7')
})

test('sem x-forwarded-for usa o x-real-ip; sem nenhum, vazio', () => {
  assert.equal(ipDoPedido(new Headers({ 'x-real-ip': '198.51.100.2' })), '198.51.100.2')
  assert.equal(ipDoPedido(new Headers({ 'x-forwarded-for': '', 'x-real-ip': '198.51.100.2' })), '198.51.100.2')
  assert.equal(ipDoPedido(new Headers()), '')
})

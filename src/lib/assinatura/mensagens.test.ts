import { test } from 'node:test'
import assert from 'node:assert/strict'
import { msgConvite, msgCodigo, msgAssinado, normalizarCelular } from './mensagens'

test('toda mensagem começa com MOVA INFORMA', () => {
  for (const m of [
    msgConvite('João', 'contrato de venda', 'https://x/assinar/abc'),
    msgCodigo('123456'),
    msgAssinado('João', 'contrato de venda', 'https://x/assinar/abc'),
  ]) assert.ok(m.startsWith('MOVA INFORMA'), `não começa com MOVA INFORMA: ${m}`)
})

test('convite traz o link e o nome', () => {
  const m = msgConvite('João', 'contrato de venda', 'https://x/assinar/abc')
  assert.ok(m.includes('https://x/assinar/abc'))
  assert.ok(m.includes('João'))
})

test('mensagem do código avisa para não repassar', () => {
  const m = msgCodigo('123456')
  assert.ok(m.includes('123456'))
  assert.match(m, /não .*(compartilh|repass)/i)
})

test('celular ganha 55 e perde máscara', () => {
  assert.equal(normalizarCelular('(35) 99999-8888'), '5535999998888')
  assert.equal(normalizarCelular('35999998888'), '5535999998888')
  assert.equal(normalizarCelular('5535999998888'), '5535999998888')
})

test('celular incompleto é recusado', () => {
  assert.equal(normalizarCelular('99998888'), null)
  assert.equal(normalizarCelular(''), null)
})

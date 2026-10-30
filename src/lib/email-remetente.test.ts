import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarRemetente } from './email-remetente'

const FROM = 'MOVA <assinatura@exemplo.com>'

test('sem nome do grupo, devolve o EMAIL_FROM sem mudança', () => {
  assert.equal(montarRemetente(FROM, null), FROM)
  assert.equal(montarRemetente(FROM, '   '), FROM)
})

test('com nome do grupo, troca só o nome e mantém o endereço', () => {
  assert.equal(montarRemetente(FROM, 'Loja Teste'), '"Loja Teste" <assinatura@exemplo.com>')
})

test('EMAIL_FROM só com endereço também recebe o nome', () => {
  assert.equal(montarRemetente('assinatura@exemplo.com', 'Loja Teste'), '"Loja Teste" <assinatura@exemplo.com>')
})

test('aspas, ângulos e quebra de linha no nome não chegam ao cabeçalho', () => {
  assert.equal(montarRemetente(FROM, 'Loja "X"\r\nBcc: a@b.c <y>'), '"Loja X Bcc: a@b.c y" <assinatura@exemplo.com>')
})

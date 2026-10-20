import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contaComoPrimeiroAcesso, precisaRegistrar } from './primeiro-acesso'

test('qualquer papel da empresa conta como 1º acesso, inclusive o sócio', () => {
  for (const papel of ['admin_socio', 'aux_adm', 'vendedor', 'mecanico']) assert.equal(contaComoPrimeiroAcesso(papel), true)
})

test('admin_geral na implantação não conta', () => {
  assert.equal(contaComoPrimeiroAcesso('admin_geral'), false)
})

test('grupo que já tem a data não pede outra escrita', () => {
  assert.equal(precisaRegistrar('vendedor', { primeiroAcessoEm: null }), true)
  assert.equal(precisaRegistrar('vendedor', { primeiroAcessoEm: new Date('2026-10-01') }), false)
  assert.equal(precisaRegistrar('admin_geral', { primeiroAcessoEm: null }), false)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contaComoPrimeiroAcesso } from './primeiro-acesso'

test('usuário de loja conta como 1º acesso', () => {
  assert.equal(contaComoPrimeiroAcesso({ papel: 'vendedor', lojaId: 'l1' }), true)
  assert.equal(contaComoPrimeiroAcesso({ papel: 'admin_socio', lojaId: 'l1' }), true)
})

test('admin_geral na implantação não conta', () => {
  assert.equal(contaComoPrimeiroAcesso({ papel: 'admin_geral', lojaId: 'l1' }), false)
})

test('usuário sem loja não marca grupo nenhum', () => {
  assert.equal(contaComoPrimeiroAcesso({ papel: 'admin_socio', lojaId: null }), false)
})

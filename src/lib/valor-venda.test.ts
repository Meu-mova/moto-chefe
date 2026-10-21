import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeAlterarValorVenda, travaDoValorVenda } from './valor-venda'

test('aux_adm é recusado ao mudar o valor da venda', () => {
  assert.equal(travaDoValorVenda('aux_adm', 10950, 10000), 'O valor da venda só pode ser alterado pelos administradores.')
})

test('aux_adm salva a edição quando o valor não muda', () => {
  assert.equal(travaDoValorVenda('aux_adm', 10950, 10950), null)
})

test('admins mudam o valor da venda', () => {
  assert.equal(travaDoValorVenda('admin_geral', 10950, 10000), null)
  assert.equal(travaDoValorVenda('admin_socio', 10950, 10000), null)
})

test('só admin_geral e admin_socio veem o valor editável', () => {
  assert.equal(podeAlterarValorVenda('admin_geral'), true)
  assert.equal(podeAlterarValorVenda('admin_socio'), true)
  assert.equal(podeAlterarValorVenda('aux_adm'), false)
  assert.equal(podeAlterarValorVenda('vendedor'), false)
})

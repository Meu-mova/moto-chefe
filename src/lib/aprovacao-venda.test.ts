import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abaixoDoMinimo, podeVenderAbaixoDoMinimo, temPagamentoSensivel } from './aprovacao-venda'

test('abaixoDoMinimo: 1 centavo abaixo ainda passa; 2 centavos abaixo pede aprovação', () => {
  assert.equal(abaixoDoMinimo(9999.99, 10000), false)
  assert.equal(abaixoDoMinimo(9999.98, 10000), true)
  assert.equal(abaixoDoMinimo(10000, 10000), false)
})

test('temPagamentoSensivel: só a transferência; financiamento não', () => {
  assert.equal(temPagamentoSensivel([{ tipo: 'pix' }, { tipo: 'transferencia' }]), true)
  assert.equal(temPagamentoSensivel([{ tipo: 'financiamento' }, { tipo: 'dinheiro' }]), false)
})

test('podeVenderAbaixoDoMinimo: só sócio e admin geral', () => {
  assert.deepEqual(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].map(podeVenderAbaixoDoMinimo), [true, true, false, false])
})

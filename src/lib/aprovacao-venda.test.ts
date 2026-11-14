import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abaixoDoMinimo, aprovacaoNecessaria, podeVenderAbaixoDoMinimo, temPagamentoSensivel } from './aprovacao-venda'
import { motivoDaAprovacao } from './pedido-de-aprovacao'
import { liquidoDaMoto } from './preco-minimo'

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

test('aprovacaoNecessaria: sensível sem permissão vem primeiro, mesmo abaixo do mínimo', () => {
  const abaixo = { liquido: 9000, minimo: 10000 }
  assert.equal(aprovacaoNecessaria({ sensivelSemPermissao: true, preco: abaixo, papel: 'aux_adm' }), 'pagamento_sensivel')
  assert.equal(aprovacaoNecessaria({ sensivelSemPermissao: false, preco: abaixo, papel: 'aux_adm' }), 'valor_minimo')
})

test('aprovacaoNecessaria: sócio abaixo do mínimo e modelo sem precificação gravam direto', () => {
  assert.equal(aprovacaoNecessaria({ sensivelSemPermissao: false, preco: { liquido: 9000, minimo: 10000 }, papel: 'admin_socio' }), null)
  assert.equal(aprovacaoNecessaria({ sensivelSemPermissao: false, preco: null, papel: 'aux_adm' }), null)
  assert.equal(aprovacaoNecessaria({ sensivelSemPermissao: false, preco: { liquido: 9999.99, minimo: 10000 }, papel: 'aux_adm' }), null)
})

test('motivoDaAprovacao: valor mínimo exige o motivo; transferência tem o padrão do Vender', () => {
  assert.equal(motivoDaAprovacao('valor_minimo', '  '), null)
  assert.equal(motivoDaAprovacao('valor_minimo', ' Cliente fiel '), 'Cliente fiel')
  assert.equal(motivoDaAprovacao('pagamento_sensivel', undefined), 'Pagamento via Transferência Bancária')
})

test('liquidoDaMoto: tira o frete do líquido, com piso 0; a taxa do cartão sobre o frete fica com a moto', () => {
  const taxas = { taxasCartao: { '10': 0.1 }, taxasDebito: {}, taxasLink: {}, taxasFinanciamento: {} }
  assert.equal(liquidoDaMoto([{ tipo: 'pix', valor: 12050 }], taxas, 150), 11900)
  assert.equal(liquidoDaMoto([{ tipo: 'pix', valor: 100 }], taxas, 150), 0)
  const noCartao = liquidoDaMoto([{ tipo: 'cartao_credito', valor: 1150, parcelas: 10 }], taxas, 150)
  assert.equal(noCartao, liquidoDaMoto([{ tipo: 'cartao_credito', valor: 1150, parcelas: 10 }], taxas, 0) - 150)
})

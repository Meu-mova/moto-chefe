import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formaPagamentoNfe, tipoPessoa, pendenciasDaVenda, idExternoNfe, proximaTentativa, type ConferenciaVenda } from './venda'

test('formas de pagamento do MOVA viram os nomes aceitos pela API', () => {
  assert.deepEqual(formaPagamentoNfe({ tipo: 'pix', valor: 10 }), { tipo: 'PagamentoInstantaneoPix', valor: 10 })
  assert.deepEqual(formaPagamentoNfe({ tipo: 'transferencia', valor: 10 }), { tipo: 'TransferenciaBancariaCarteiraDigital', valor: 10 })
  assert.deepEqual(formaPagamentoNfe({ tipo: 'cartao_credito', valor: 10, parcelas: 10 }), { tipo: 'CartaoDeCredito', valor: 10 })
  assert.deepEqual(formaPagamentoNfe({ tipo: 'link_pagamento', valor: 10 }), { tipo: 'CartaoDeCredito', valor: 10 })
  assert.deepEqual(formaPagamentoNfe({ tipo: 'cartao_debito', valor: 10 }), { tipo: 'CartaoDeDebito', valor: 10 })
  assert.deepEqual(formaPagamentoNfe({ tipo: 'dinheiro', valor: 10 }), { tipo: 'Dinheiro', valor: 10 })
  assert.deepEqual(formaPagamentoNfe({ tipo: 'financiamento', valor: 10 }), { tipo: 'Outros', valor: 10, descricao: 'Financiamento' })
})

test('tipo desconhecido vira Outros com a descrição que a SEFAZ exige', () => {
  assert.deepEqual(formaPagamentoNfe({ tipo: 'Não informado', valor: 5 }), { tipo: 'Outros', valor: 5, descricao: 'Não informado' })
})

test('CNPJ é pessoa jurídica, CPF é física', () => {
  assert.equal(tipoPessoa('12.345.678/0001-90'), 'J')
  assert.equal(tipoPessoa('123.456.789-09'), 'F')
})

const OK: ConferenciaVenda = {
  clienteNome: 'FULANO', clienteCpf: '123.456.789-09',
  clienteLogradouro: 'Rua A', clienteNumero: '10', clienteBairro: 'Centro',
  clienteCidade: 'Varginha', clienteEstado: 'MG', clienteCep: '37000-000',
  valor: 100, pagamentos: [{ tipo: 'pix', valor: 100 }], temFicha: true,
}

test('venda completa não tem pendência', () => {
  assert.deepEqual(pendenciasDaVenda(OK), [])
})

test('endereço incompleto lista o que falta numa linha só', () => {
  const p = pendenciasDaVenda({ ...OK, clienteBairro: ' ', clienteCep: '370' })
  assert.deepEqual(p, ['Endereço do cliente incompleto (bairro, CEP) — edite a venda'])
})

test('pagamento que não fecha com o valor é pendência', () => {
  const p = pendenciasDaVenda({ ...OK, pagamentos: [{ tipo: 'pix', valor: 90 }] })
  assert.equal(p.length, 1)
  assert.match(p[0], /somam R\$ 90\.00/)
})

test('id externo separa homologação de produção e numera a tentativa', () => {
  assert.equal(idExternoNfe(31578, 1, 'Producao'), 'mova-31578-1')
  assert.equal(idExternoNfe(31578, 2, 'Homologacao'), 'mova-homolog-31578-2')
  // Com uuid a API devolveu 500; o id tem de ficar na faixa dos que passaram.
  assert.ok(idExternoNfe(9999999, 99, 'Homologacao').length <= 25)
})

test('próxima tentativa segue o maior sufixo, não a contagem de linhas', () => {
  // A tentativa 1 foi apagada: contar daria 2 de novo, que já existe.
  assert.equal(proximaTentativa(['mova-homolog-31578-2'], 31578, 'Homologacao'), 3)
  assert.equal(proximaTentativa([], 31578, 'Homologacao'), 1)
})

test('próxima tentativa ignora outro ambiente e outra venda com prefixo parecido', () => {
  const ids = ['mova-31578-4', 'mova-homolog-31578-1', 'mova-homolog-315780-9']
  assert.equal(proximaTentativa(ids, 31578, 'Homologacao'), 2)
  assert.equal(proximaTentativa(ids, 31578, 'Producao'), 5)
})

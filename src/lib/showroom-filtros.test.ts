import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrosDoShowroom, paramsDoShowroom } from './showroom-filtros'

// Regra de loja da tela /estoque, copiada antes do refactor (#512): a impressão usa a mesma.
const grupo = ['loja-1', 'loja-2']
const socio = { papel: 'admin_socio', lojaId: null }
const vendedor = { papel: 'vendedor', lojaId: 'loja-2' }

test('loja do filtro só vale se for do grupo ativo', () => {
  assert.deepEqual(filtrosDoShowroom({ loja: 'loja-1,loja-de-outra-conta' }, vendedor, grupo).lojaId, ['loja-1'])
  assert.deepEqual(filtrosDoShowroom({ loja: 'loja-1' }, socio, grupo).lojaId, ['loja-1'])
})

test('sem loja válida: admin vê o grupo inteiro, os demais a própria loja', () => {
  assert.deepEqual(filtrosDoShowroom({ loja: 'loja-de-outra-conta' }, socio, grupo).lojaId, grupo)
  assert.deepEqual(filtrosDoShowroom({}, { papel: 'admin_geral', lojaId: null }, grupo).lojaId, grupo)
  assert.deepEqual(filtrosDoShowroom({ loja: 'loja-de-outra-conta' }, vendedor, grupo).lojaId, ['loja-2'])
  assert.deepEqual(filtrosDoShowroom({}, { papel: 'aux_adm', lojaId: null }, grupo).lojaId, [], 'sem loja, nada')
})

test('demais filtros e ordenação como na tela', () => {
  const f = filtrosDoShowroom(
    { status: 'caixa,montada', disponibilidade: 'disponivel', modelo: 'm1', cor: 'PRETO', q: 'ABC', transf: '1', ord: 'cor', dir: 'desc' },
    socio, grupo,
  )
  assert.deepEqual(f, {
    status: ['caixa', 'montada'], disponibilidade: ['disponivel'], excluirVendidas: true, chassiBusca: 'ABC',
    lojaId: grupo, modeloId: ['m1'], cor: ['PRETO'], apenasTransferencia: true, ord: 'cor', dir: 'desc',
  })
  const padrao = filtrosDoShowroom({ ord: 'preco', dir: 'x' }, socio, grupo)
  assert.equal(padrao.ord, 'modelo')
  assert.equal(padrao.dir, 'asc')
  assert.equal(padrao.disponibilidade, undefined)
})

test('paramsDoShowroom repassa só os filtros preenchidos', () => {
  assert.equal(paramsDoShowroom({ q: 'ABC', loja: 'loja-1', ord: 'cor' }), 'q=ABC&loja=loja-1')
  assert.equal(paramsDoShowroom({}), '')
})

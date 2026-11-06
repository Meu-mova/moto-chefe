// Entrega da venda que chega do navegador (#725): o servidor só grava o que a regra aceita.
import test from 'node:test'
import assert from 'node:assert/strict'
import { conferirEntrega, operacaoDaVenda, textoDaOperacao, type EntregaVenda } from './entrega'

test('retira na loja com uma modalidade da lista é aceita como veio', () => {
  assert.deepEqual(
    conferirEntrega({ modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' }),
    { ok: true, entrega: { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' } },
  )
})

test('retira na loja sem modalidade é aceita: a prévia da NF avisa depois', () => {
  assert.deepEqual(conferirEntrega({ modo: 'retira', modalidade: '' }), { ok: true, entrega: { modo: 'retira', modalidade: '' } })
})

test('modalidade fora da lista 4.0 é recusada, inclusive o SemTransporte antigo', () => {
  for (const modalidade of ['SemTransporte', 'PorContaDoDestinatario', 'qualquer']) {
    assert.deepEqual(conferirEntrega({ modo: 'retira', modalidade }), { ok: false, erro: 'Modalidade do frete inválida.' })
  }
})

test('sem entrega, ou com um modo que este fluxo não oferece, é recusada', () => {
  for (const dado of [undefined, null, {}, 'retira', { modo: 'entregar', modalidade: '' }, { modo: 'retira' }]) {
    assert.deepEqual(conferirEntrega(dado), { ok: false, erro: 'Escolha a entrega da venda.' })
  }
})

test('campo a mais que o navegador mande não é gravado', () => {
  assert.deepEqual(
    conferirEntrega({ modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte', valorFrete: 999 }),
    { ok: true, entrega: { modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte' } },
  )
})

// Dentro ou fora do estado pela Entrega (#682 Q1, com as exceções do contador de Teresina em 05/11).
const RETIRA: EntregaVenda = { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' }
const PI_PARA_MA = { ufEmitente: 'PI', ufCliente: 'MA', clienteContribuinte: false, ciclomotor: false }

test('retira na loja com cliente de outra UF é venda dentro do estado', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: RETIRA }),
    { interestadual: false, motivo: 'retira', ufOrigem: 'PI', ufDestino: 'PI' })
})

test('retira na loja de moto que se emplaca (ciclomotor), cliente de outra UF, é para outro estado', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: RETIRA, ciclomotor: true }),
    { interestadual: true, motivo: 'retira_ciclomotor', ufOrigem: 'PI', ufDestino: 'MA' })
})

test('retira na loja de cliente contribuinte (com IE) de outra UF é para outro estado', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: RETIRA, clienteContribuinte: true }),
    { interestadual: true, motivo: 'retira_contribuinte', ufOrigem: 'PI', ufDestino: 'MA' })
})

test('as exceções só valem para cliente de outra UF: ciclomotor e contribuinte da UF da loja ficam dentro do estado', () => {
  const mesmaUf = { ...PI_PARA_MA, ufCliente: 'pi', entrega: RETIRA, ciclomotor: true, clienteContribuinte: true }
  assert.deepEqual(operacaoDaVenda(mesmaUf), { interestadual: false, motivo: 'retira', ufOrigem: 'PI', ufDestino: 'PI' })
})

test('venda sem Entrega segue a regra antiga: a UF do cliente decide', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: null }),
    { interestadual: true, motivo: 'sem_entrega', ufOrigem: 'PI', ufDestino: 'MA' })
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, ufCliente: 'PI', entrega: null }),
    { interestadual: false, motivo: 'sem_entrega', ufOrigem: 'PI', ufDestino: 'PI' })
})

test('o selo diz dentro ou fora do estado com as UFs, e o porquê diz qual regra decidiu', () => {
  assert.deepEqual(textoDaOperacao({ interestadual: false, motivo: 'retira', ufOrigem: 'PI', ufDestino: 'PI' }),
    { selo: 'Dentro do estado (PI para PI)', porque: 'O cliente retira a moto na loja: vale a regra de dentro do estado.' })
  assert.deepEqual(textoDaOperacao({ interestadual: true, motivo: 'retira_ciclomotor', ufOrigem: 'PI', ufDestino: 'MA' }),
    { selo: 'Para outro estado (PI para MA)', porque: 'O cliente retira na loja, mas a moto se emplaca no estado dele (ciclomotor): a venda é para outro estado.' })
  assert.deepEqual(textoDaOperacao({ interestadual: true, motivo: 'retira_contribuinte', ufOrigem: 'PI', ufDestino: 'MA' }),
    { selo: 'Para outro estado (PI para MA)', porque: 'O cliente retira na loja, mas tem inscrição estadual em outro estado: a venda é para outro estado.' })
  assert.deepEqual(textoDaOperacao({ interestadual: true, motivo: 'sem_entrega', ufOrigem: 'PI', ufDestino: 'MA' }),
    { selo: 'Para outro estado (PI para MA)', porque: 'Esta venda não tem a Entrega informada: vale a UF do endereço do cliente. Confira antes de emitir.' })
})

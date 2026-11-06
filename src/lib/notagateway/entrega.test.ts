// Entrega da venda que chega do navegador (#725): o servidor só grava o que a regra aceita.
import test from 'node:test'
import assert from 'node:assert/strict'
import { conferirEntrega } from './entrega'

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

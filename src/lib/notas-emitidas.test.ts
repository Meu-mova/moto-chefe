import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificarNota } from './notas-emitidas'

test('classificarNota agrupa os status da Nota Gateway nos filtros da tela', () => {
  assert.equal(classificarNota('Autorizada'), 'autorizada')
  assert.equal(classificarNota('CancelamentoNegado'), 'autorizada', 'cancelamento recusado: a nota continua valendo')
  assert.equal(classificarNota('Cancelada'), 'cancelada')
  assert.equal(classificarNota('Negada'), 'recusada')
  assert.equal(classificarNota('Denegada'), 'recusada')
  assert.equal(classificarNota('Descartada'), 'descartada')
  assert.equal(classificarNota('Enviando'), 'em_andamento')
  assert.equal(classificarNota('Processando'), 'em_andamento')
  assert.equal(classificarNota('SolicitandoCancelamento'), 'em_andamento')
  assert.equal(classificarNota('StatusQueAApiAindaVaiInventar'), 'em_andamento')
})

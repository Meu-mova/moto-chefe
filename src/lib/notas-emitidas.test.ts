import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificarNota, linkDaVenda, periodoEmissao } from './notas-emitidas'

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

test('linkDaVenda abre Vendas filtrada pelo chassi, a partir do dia da venda em Brasília', () => {
  // 22h30 de 31/10 em Brasília = 01h30 de 01/11 em UTC.
  assert.equal(linkDaVenda({ chassi: 'LXY123', dataVenda: '2026-11-01T01:30:00.000Z' }), '/vendas?q=LXY123&de=2026-10-31')
  assert.equal(linkDaVenda({ chassi: null, dataVenda: null }), null, 'nota sem venda (venda cancelada, #347)')
})

test('periodoEmissao: padrão é o mês corrente em Brasília; data inválida volta ao padrão', () => {
  // 22h de 31/10 em Brasília (01h de 01/11 em UTC): ainda é outubro aqui.
  const agora = new Date('2026-11-01T01:00:00.000Z')
  assert.deepEqual(periodoEmissao({}, agora), { de: '2026-10-01', ate: '2026-10-31' })
  assert.deepEqual(periodoEmissao({ de: '2026-09-15', ate: '2026-09-20' }, agora), { de: '2026-09-15', ate: '2026-09-20' })
  assert.deepEqual(periodoEmissao({ de: '2026-02-30', ate: 'lixo' }, agora), { de: '2026-10-01', ate: '2026-10-31' })
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcStatusMultiPagamento,
  matchPagamentos,
  valorConciliadoManual,
  type ConciliadoManual,
  type PgtoOS,
} from './conciliacao-status'

const FORCADO: ConciliadoManual = {
  motivo: 'PIX caiu na conta pessoal',
  porId: 'u1',
  porNome: 'Cesar',
  em: '2026-07-31T12:00:00.000Z',
}

// ── valorConciliadoManual ────────────────────────────────────────────────────

test('soma só os pagamentos forçados', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'pix', valor: 1000, conciliadoManual: FORCADO },
    { tipo: 'cartao_credito', valor: 500 },
  ]
  assert.equal(valorConciliadoManual(pgtos), 1000)
})

test('dinheiro forçado não soma — não conta pro total a conciliar', () => {
  const pgtos: PgtoOS[] = [{ tipo: 'dinheiro', valor: 800, conciliadoManual: FORCADO }]
  assert.equal(valorConciliadoManual(pgtos), 0)
})

test('sem pagamentos não quebra', () => {
  assert.equal(valorConciliadoManual(null), 0)
  assert.equal(valorConciliadoManual([]), 0)
})

// ── calcStatusMultiPagamento ─────────────────────────────────────────────────

test('pagamento forçado sozinho fecha a conciliação', () => {
  const pgtos: PgtoOS[] = [{ tipo: 'pix', valor: 9000, conciliadoManual: FORCADO }]
  assert.equal(calcStatusMultiPagamento(pgtos, 0, 0, '9000'), 'conciliada')
})

test('1 de 2 formas forçada fica parcial', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'pix', valor: 4000, conciliadoManual: FORCADO },
    { tipo: 'cartao_credito', valor: 5000 },
  ]
  assert.equal(calcStatusMultiPagamento(pgtos, 0, 0, '9000'), 'parcial')
})

test('forçado somado ao que já estava conciliado de verdade fecha', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'pix', valor: 4000, conciliadoManual: FORCADO },
    { tipo: 'cartao_credito', valor: 5000 },
  ]
  assert.equal(calcStatusMultiPagamento(pgtos, 5000, 0, '9000'), 'conciliada')
})

test('sem o campo o status atual é preservado — não-regressão', () => {
  const pgtos: PgtoOS[] = [{ tipo: 'cartao_credito', valor: 9000 }]
  assert.equal(calcStatusMultiPagamento(pgtos, 0, 0, '9000'), 'pendente')
  assert.equal(calcStatusMultiPagamento(pgtos, 9000, 0, '9000'), 'conciliada')
  assert.equal(calcStatusMultiPagamento([], 0, 0, '9000'), 'na')
})

test('forçar não conserta pagamento lançado a menos que o valor da venda', () => {
  // Só R$ 4.000 lançados numa venda de R$ 9.000: falta lançamento, não conciliação.
  const pgtos: PgtoOS[] = [{ tipo: 'pix', valor: 4000, conciliadoManual: FORCADO }]
  assert.equal(calcStatusMultiPagamento(pgtos, 0, 0, '9000'), 'parcial')
})

// ── matchPagamentos ──────────────────────────────────────────────────────────

test('forçado aparece como conciliado na linha', () => {
  const pgtos: PgtoOS[] = [{ tipo: 'cartao_credito', valor: 500, conciliadoManual: FORCADO }]
  assert.deepEqual(matchPagamentos(pgtos, [], []), [true])
})

test('forçado não rouba a transação por valor do irmão pendente', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'cartao_credito', valor: 500, conciliadoManual: FORCADO },
    { tipo: 'cartao_debito', valor: 500 },
  ]
  const concs = [{ id: 'c1', autorizacao: null, valorBruto: 500 }]
  // A única transação real tem que sobrar para o pagamento que ainda está pendente.
  assert.deepEqual(matchPagamentos(pgtos, concs, []), [true, true])
})

test('match por autorização continua valendo com um irmão forçado', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'pix', valor: 1000, conciliadoManual: FORCADO },
    { tipo: 'cartao_credito', valor: 500, autorizacao: 'ABC123' },
  ]
  const concs = [{ id: 'c1', autorizacao: 'ABC123', valorBruto: 500 }]
  assert.deepEqual(matchPagamentos(pgtos, concs, []), [true, true])
})

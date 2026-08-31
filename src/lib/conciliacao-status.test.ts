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

const conciliados = (r: ReturnType<typeof matchPagamentos>) => r.map(x => x.conciliado)

test('forçado aparece como conciliado na linha', () => {
  const pgtos: PgtoOS[] = [{ tipo: 'cartao_credito', valor: 500, conciliadoManual: FORCADO }]
  assert.deepEqual(conciliados(matchPagamentos(pgtos, [], [])), [true])
})

test('forçado não rouba a transação por valor do irmão pendente', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'cartao_credito', valor: 500, conciliadoManual: FORCADO },
    { tipo: 'cartao_debito', valor: 500 },
  ]
  const concs = [{ id: 'c1', autorizacao: null, valorBruto: 500 }]
  // A única transação real tem que sobrar para o pagamento que ainda está pendente.
  assert.deepEqual(conciliados(matchPagamentos(pgtos, concs, [])), [true, true])
})

test('match por autorização continua valendo com um irmão forçado', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'pix', valor: 1000, conciliadoManual: FORCADO },
    { tipo: 'cartao_credito', valor: 500, autorizacao: 'ABC123' },
  ]
  const concs = [{ id: 'c1', autorizacao: 'ABC123', valorBruto: 500 }]
  assert.deepEqual(conciliados(matchPagamentos(pgtos, concs, [])), [true, true])
})

// ── Cobertura por valor: a linha só fica verde se o dinheiro recebido cobre ──
// Regressão da venda #30744 e cia: a linha dizia "conciliado" com valor faltando.

test('PIX recebido a menos não fecha a linha (venda #30744)', () => {
  const pgtos: PgtoOS[] = [{ tipo: 'pix', valor: 10990 }]
  const r = matchPagamentos(pgtos, [], [{ id: 'p1', valor: 5990 }])
  assert.equal(r[0].conciliado, false)
  assert.equal(r[0].coberto, 5990)
})

test('um recebimento PIX não pinta os dois pagamentos PIX (venda #30732)', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'pix', valor: 2000 },
    { tipo: 'pix', valor: 10490 },
  ]
  const r = matchPagamentos(pgtos, [], [{ id: 'p1', valor: 2000 }])
  assert.deepEqual(conciliados(r), [true, false])
  assert.equal(r[1].coberto, 0)
})

test('PIX recebido em várias parcelas soma e fecha', () => {
  const pgtos: PgtoOS[] = [{ tipo: 'pix', valor: 10490 }]
  const r = matchPagamentos(pgtos, [], [
    { id: 'p1', valor: 5000 }, { id: 'p2', valor: 5000 }, { id: 'p3', valor: 490 },
  ])
  assert.equal(r[0].conciliado, true)
})

test('cartão casado por autorização com valor menor não fecha (venda #30729)', () => {
  const pgtos: PgtoOS[] = [{ tipo: 'cartao_debito', valor: 997.42, autorizacao: '568252' }]
  const r = matchPagamentos(pgtos, [{ id: 'c1', autorizacao: '568252', valorBruto: 990 }], [])
  assert.equal(r[0].conciliado, false)
  assert.equal(r[0].coberto, 990)
})

test('transação vinculada que não casa com nenhuma linha ainda cobre o que falta', () => {
  // Uma única transação agregada de 200 para dois pagamentos de 100: nenhuma casa
  // por valor exato, mas o dinheiro entrou e o badge da tabela diz conciliada.
  const pgtos: PgtoOS[] = [
    { tipo: 'cartao_credito', valor: 100 },
    { tipo: 'cartao_credito', valor: 100 },
  ]
  const r = matchPagamentos(pgtos, [{ id: 'c1', autorizacao: null, valorBruto: 200 }], [])
  assert.deepEqual(conciliados(r), [true, true])
})

test('linha verde em tudo implica badge conciliada — as duas contas concordam', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'pix', valor: 7000 },
    { tipo: 'cartao_credito', valor: 6590, autorizacao: 'X1' },
  ]
  const concs   = [{ id: 'c1', autorizacao: 'X1', valorBruto: 6590 }]
  const pixRecs = [{ id: 'p1', valor: 7000 }]

  assert.deepEqual(conciliados(matchPagamentos(pgtos, concs, pixRecs)), [true, true])
  assert.equal(calcStatusMultiPagamento(pgtos, 6590, 7000, '13590'), 'conciliada')
})

test('venda #30751 real: PIX curto deixa linha aberta e badge parcial', () => {
  const pgtos: PgtoOS[] = [
    { tipo: 'pix', valor: 7000 },
    { tipo: 'cartao_credito', valor: 6590, autorizacao: 'X1' },
  ]
  const concs   = [{ id: 'c1', autorizacao: 'X1', valorBruto: 6590 }]
  const pixRecs = [{ id: 'p1', valor: 6000 }]

  assert.deepEqual(conciliados(matchPagamentos(pgtos, concs, pixRecs)), [false, true])
  assert.equal(calcStatusMultiPagamento(pgtos, 6590, 6000, '13590'), 'parcial')
})

test('PIX casa pela linha de mesmo valor antes de ratear (NF 2284)', () => {
  // Venda 556bb9b2: três PIX lançados, e os recebimentos de 5.000 e 1.000 conciliados.
  // O rateio na ordem pintava a linha de 4.490 e deixava as duas certas em vermelho.
  const pgtos: PgtoOS[] = [
    { tipo: 'pix', valor: 4490 },
    { tipo: 'pix', valor: 5000 },
    { tipo: 'pix', valor: 1000 },
  ]
  const r = matchPagamentos(pgtos, [], [{ id: 'p1', valor: 5000 }, { id: 'p2', valor: 1000 }])
  assert.deepEqual(conciliados(r), [false, true, true])
  assert.equal(r[0].coberto, 0)
})

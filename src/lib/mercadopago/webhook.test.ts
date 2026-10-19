import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { assinaturaValida, decidirBaixa, ambienteConfere } from './webhook'

const SECRET = 'segredo-de-teste'
function assinar(manifesto: string) {
  return createHmac('sha256', SECRET).update(manifesto).digest('hex')
}

test('assinatura certa passa, com o data.id em minúsculas', () => {
  const v1 = assinar('id:abc123;request-id:req-1;ts:1700000000;')
  assert.equal(assinaturaValida({ secret: SECRET, xSignature: `ts=1700000000,v1=${v1}`, xRequestId: 'req-1', dataId: 'ABC123' }), true)
})

test('assinatura de outro segredo, sem header ou com corpo trocado não passa', () => {
  const v1 = assinar('id:abc123;request-id:req-1;ts:1700000000;')
  assert.equal(assinaturaValida({ secret: 'outro', xSignature: `ts=1700000000,v1=${v1}`, xRequestId: 'req-1', dataId: 'abc123' }), false)
  assert.equal(assinaturaValida({ secret: SECRET, xSignature: null, xRequestId: 'req-1', dataId: 'abc123' }), false)
  assert.equal(assinaturaValida({ secret: SECRET, xSignature: `ts=1700000000,v1=${v1}`, xRequestId: 'req-1', dataId: '999' }), false)
})

test('sem x-request-id, a parte sai do manifesto', () => {
  const v1 = assinar('id:42;ts:1700000000;')
  assert.equal(assinaturaValida({ secret: SECRET, xSignature: `ts=1700000000, v1=${v1}`, xRequestId: null, dataId: '42' }), true)
})

const PG = { id: 1, status: 'approved', external_reference: 'm1', transaction_amount: 1498 }

test('pagamento aprovado com o valor devido dá baixa', () => {
  assert.deepEqual(decidirBaixa(PG, { status: 'aberta', valorDevido: 1498 }), { acao: 'pagar' })
})

test('pagamento pendente ou já pago não dá baixa de novo', () => {
  assert.equal(decidirBaixa({ ...PG, status: 'pending' }, { status: 'aberta', valorDevido: 1498 }).acao, 'ignorar')
  assert.equal(decidirBaixa(PG, { status: 'paga', valorDevido: 1498 }).acao, 'ignorar')
})

test('valor menor que o devido é erro, não baixa', () => {
  assert.equal(decidirBaixa({ ...PG, transaction_amount: 10 }, { status: 'aberta', valorDevido: 1498 }).acao, 'erro')
})

test('mensalidade inexistente é erro', () => {
  assert.equal(decidirBaixa(PG, null).acao, 'erro')
})

test('produção só aceita live_mode verdadeiro; staging só falso', () => {
  assert.equal(ambienteConfere(true, true), true)
  assert.equal(ambienteConfere(false, true), false)
  assert.equal(ambienteConfere(false, false), true)
  assert.equal(ambienteConfere(true, false), false)
})

test('pagamento aprovado para mensalidade cancelada é erro, não baixa', () => {
  assert.deepEqual(decidirBaixa(PG, { status: 'cancelada', valorDevido: 1498 }), { acao: 'erro', motivo: 'pagamento aprovado para mensalidade cancelada' })
})

test('estorno e chargeback viram erro; outros status não aprovados são ignorados', () => {
  assert.equal(decidirBaixa({ ...PG, status: 'refunded' }, { status: 'paga', valorDevido: 1498 }).acao, 'erro')
  assert.equal(decidirBaixa({ ...PG, status: 'charged_back' }, { status: 'paga', valorDevido: 1498 }).acao, 'erro')
  assert.equal(decidirBaixa({ ...PG, status: 'rejected' }, { status: 'aberta', valorDevido: 1498 }).acao, 'ignorar')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { situacaoContrato } from './adesao-campos'

const AGORA = new Date('2026-10-16T12:00:00Z')
const AMANHA = '2026-10-17T12:00:00Z'
const ONTEM = '2026-10-15T12:00:00Z'

test('sem contrato, ou com o último cancelado, não há situação', () => {
  assert.equal(situacaoContrato(null, AGORA), null)
  assert.equal(situacaoContrato({ status: 'cancelado', expiraEm: AMANHA }, AGORA), null)
})

test('contrato no prazo: enviado ou visualizado', () => {
  assert.equal(situacaoContrato({ status: 'pendente', expiraEm: AMANHA }, AGORA), 'enviado')
  assert.equal(situacaoContrato({ status: 'visualizado', expiraEm: AMANHA }, AGORA), 'visualizado')
})

test('contrato vencido sem assinatura aparece como expirado', () => {
  assert.equal(situacaoContrato({ status: 'pendente', expiraEm: ONTEM }, AGORA), 'expirado')
  assert.equal(situacaoContrato({ status: 'visualizado', expiraEm: ONTEM }, AGORA), 'expirado')
})

test('assinado continua assinado depois do prazo do link', () => {
  assert.equal(situacaoContrato({ status: 'assinado', expiraEm: ONTEM }, AGORA), 'assinado')
})

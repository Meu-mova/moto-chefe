import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeEmitirNf, motivoBloqueioNf } from './nf'

test('sem contrato assinado, não emite', () => {
  assert.equal(podeEmitirNf({ contratoAssinado: false, liberadaEm: null }), false)
})

test('mensagem de bloqueio explica o que fazer', () => {
  const motivo = motivoBloqueioNf({ contratoAssinado: false, liberadaEm: null })
  assert.ok(motivo && motivo.includes('contrato'))
})

test('com contrato assinado, emite', () => {
  assert.equal(podeEmitirNf({ contratoAssinado: true, liberadaEm: null }), true)
  assert.equal(motivoBloqueioNf({ contratoAssinado: true, liberadaEm: null }), null)
})

test('liberação de exceção destrava sem contrato', () => {
  const s = { contratoAssinado: false, liberadaEm: new Date('2026-08-11T12:00:00.000Z') }
  assert.equal(podeEmitirNf(s), true)
  assert.equal(motivoBloqueioNf(s), null)
})

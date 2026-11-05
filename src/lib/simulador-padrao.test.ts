import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destaqueAvista12x, ehPadraoSimulador } from './simulador-padrao'

test('à vista + 12x: o total digitado vira 12 parcelas, sem taxa', () => {
  assert.deepEqual(destaqueAvista12x(12990, 15600), {
    pix: 12990, total12x: 15600, parcela12x: 1300, descontoPix: 17, economiaPix: 2610,
  })
})

test('parcela arredonda em centavos', () => {
  assert.equal(destaqueAvista12x(9000, 10000).parcela12x, 833.33)
})

test('modelo sem total em 12x mostra só o PIX', () => {
  for (const v of [null, 0]) {
    assert.deepEqual(destaqueAvista12x(12990, v), {
      pix: 12990, total12x: null, parcela12x: null, descontoPix: null, economiaPix: null,
    })
  }
})

test('12x igual ou abaixo do PIX não mostra desconto', () => {
  const r = destaqueAvista12x(12990, 12000)
  assert.equal(r.total12x, 12000)
  assert.equal(r.descontoPix, null)
  assert.equal(r.economiaPix, null)
})

test('só os dois padrões existem', () => {
  assert.equal(ehPadraoSimulador('taxas'), true)
  assert.equal(ehPadraoSimulador('avista_12x'), true)
  assert.equal(ehPadraoSimulador('outro'), false)
  assert.equal(ehPadraoSimulador(undefined), false)
})

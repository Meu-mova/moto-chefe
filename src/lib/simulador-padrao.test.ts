import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destaqueAvista12x, ehPadraoSimulador, lerTotal12x, usaValor12x } from './simulador-padrao'

test('à vista + 12x: o total digitado vira 12 parcelas, sem taxa', () => {
  const r = destaqueAvista12x(13990, 15600)
  assert.equal(r.pix, 13990)
  assert.equal(r.total12x, 15600)
  assert.equal(r.parcela12x, 1300)
  assert.equal(r.descontoPix, 10)
  assert.equal(r.economiaPix, 1610)
  assert.equal(r.pixAcimaDo12x, false)
})

test('parcela arredonda em centavos', () => {
  assert.equal(destaqueAvista12x(9000, 10000).parcela12x, 833.33)
})

test('modelo sem total em 12x mostra só o PIX', () => {
  const r = destaqueAvista12x(12990, null)
  assert.deepEqual([r.total12x, r.parcela12x, r.descontoPix, r.economiaPix, r.pixAcimaDo12x], [null, null, null, null, false])
})

test('12x igual ou abaixo do PIX: sem desconto e com aviso', () => {
  for (const t12 of [12990, 12000]) {
    const r = destaqueAvista12x(12990, t12)
    assert.equal(r.total12x, t12)
    assert.equal(r.descontoPix, null)
    assert.equal(r.economiaPix, null)
    assert.equal(r.pixAcimaDo12x, true)
  }
})

test('desconto que arredonda a 0% não aparece; a economia continua', () => {
  const r = destaqueAvista12x(15550, 15600)
  assert.equal(r.descontoPix, null)
  assert.equal(r.economiaPix, 50)
})

test('com frete: PIX + frete e 12x + frete em parcelas', () => {
  const r = destaqueAvista12x(13990, 15600, 168)
  assert.deepEqual(r.comFrete, { custo: 168, pix: 14158, parcela12x: 1314 })
})

test('com frete e sem 12x: só o PIX + frete', () => {
  assert.deepEqual(destaqueAvista12x(13990, null, 168).comFrete, { custo: 168, pix: 14158, parcela12x: null })
  assert.equal(destaqueAvista12x(13990, 15600).comFrete, null)
})

test('total em 12x digitado: vazio e zero são "sem 12x"', () => {
  for (const v of ['', '  ', '0', '0.00']) assert.equal(lerTotal12x(v), null, `"${v}"`)
  assert.equal(lerTotal12x('15600'), 15600)
  assert.equal(lerTotal12x('15600.50'), 15600.5)
})

test('total em 12x digitado: negativo ou texto é inválido', () => {
  for (const v of ['-1', 'abc', 'Infinity']) assert.equal(lerTotal12x(v), 'invalido', `"${v}"`)
})

test('só os dois padrões existem, e só o novo usa o valor em 12x', () => {
  assert.equal(ehPadraoSimulador('taxas'), true)
  assert.equal(ehPadraoSimulador('avista_12x'), true)
  assert.equal(ehPadraoSimulador('outro'), false)
  assert.equal(ehPadraoSimulador(undefined), false)
  assert.equal(usaValor12x('avista_12x'), true)
  assert.equal(usaValor12x('taxas'), false)
})

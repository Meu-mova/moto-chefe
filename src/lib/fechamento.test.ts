import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nomeMes, mesAnterior, variacaoPct, pctMeta, classeMeta, mesValido, parseMes, formatarMes,
} from './fechamento'

test('nomeMes', () => {
  assert.equal(nomeMes(2026, 8), 'Agosto 2026')
  assert.equal(nomeMes(2026, 1), 'Janeiro 2026')
})

test('mesAnterior vira o ano em janeiro', () => {
  assert.deepEqual(mesAnterior(2026, 8), { ano: 2026, mes: 7 })
  assert.deepEqual(mesAnterior(2026, 1), { ano: 2025, mes: 12 })
})

test('variacaoPct', () => {
  assert.equal(variacaoPct(150, 100), 50)
  assert.equal(variacaoPct(2823578.03, 1876462.67)!.toFixed(1), '50.5')
  assert.equal(variacaoPct(100, 0), null)   // sem base
})

test('pctMeta e classeMeta', () => {
  assert.equal(pctMeta(613140.70, 500000)!.toFixed(1), '122.6')
  assert.equal(pctMeta(100, 0), null)
  assert.equal(classeMeta(132), 'batida')
  assert.equal(classeMeta(100), 'batida')
  assert.equal(classeMeta(91.6), 'perto')
  assert.equal(classeMeta(70.7), 'abaixo')
  assert.equal(classeMeta(null), 'sem')
})

test('mesValido', () => {
  assert.equal(mesValido('2026-08'), true)
  assert.equal(mesValido('2026-13'), false)
  assert.equal(mesValido('2026-00'), false)
  assert.equal(mesValido('2026-8'), false)
  assert.equal(mesValido(undefined), false)
})

test('parseMes / formatarMes ida e volta', () => {
  assert.deepEqual(parseMes('2026-08'), { ano: 2026, mes: 8 })
  assert.equal(formatarMes(2026, 8), '2026-08')
  assert.equal(formatarMes(2026, 12), '2026-12')
})

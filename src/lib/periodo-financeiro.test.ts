import { test } from 'node:test'
import assert from 'node:assert/strict'
import { periodoFinanceiro, limitesDoPeriodo } from './periodo-financeiro'

const HOJE = '2026-11-10'

test('sem parâmetro, abre no mês corrente inteiro', () => {
  assert.deepEqual(periodoFinanceiro({}, HOJE), { de: '2026-11-01', ate: '2026-11-30' })
})

test('dezembro fecha no dia 31 do mesmo ano', () => {
  assert.deepEqual(periodoFinanceiro({}, '2026-12-05'), { de: '2026-12-01', ate: '2026-12-31' })
})

test('usa de e até informados', () => {
  assert.deepEqual(periodoFinanceiro({ de: '2026-10-15', ate: '2026-11-03' }, HOJE), { de: '2026-10-15', ate: '2026-11-03' })
})

test('só um lado informado: o outro fica no mês corrente', () => {
  assert.deepEqual(periodoFinanceiro({ de: '2026-11-05' }, HOJE), { de: '2026-11-05', ate: '2026-11-30' })
  assert.deepEqual(periodoFinanceiro({ ate: '2026-11-20' }, HOJE), { de: '2026-11-01', ate: '2026-11-20' })
})

test('data inválida cai no padrão', () => {
  assert.deepEqual(periodoFinanceiro({ de: '2026-02-30', ate: 'abc' }, HOJE), { de: '2026-11-01', ate: '2026-11-30' })
})

test('de depois do até: inverte em vez de mostrar tela zerada', () => {
  assert.deepEqual(periodoFinanceiro({ de: '2026-11-20', ate: '2026-11-02' }, HOJE), { de: '2026-11-02', ate: '2026-11-20' })
})

test('link antigo com ?mes= ainda abre aquele mês', () => {
  assert.deepEqual(periodoFinanceiro({ mes: '2026-02' }, HOJE), { de: '2026-02-01', ate: '2026-02-28' })
})

test('limites: do 00:00Z do de ao 00:00Z do dia seguinte ao até, virando o ano', () => {
  const l = limitesDoPeriodo({ de: '2026-12-01', ate: '2026-12-31' })
  assert.equal(l.inicioTs.toISOString(), '2026-12-01T00:00:00.000Z')
  assert.equal(l.fimTs.toISOString(), '2027-01-01T00:00:00.000Z')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarOrigemVenda, normalizarDetalhe, type OrigemParaValidar } from './origem-venda'

const GRUPO = 'g-sul'

const INSTAGRAM: OrigemParaValidar = { id: 'o1', ativo: true, grupoId: GRUPO, pedeDetalhe: false }
const INDICACAO: OrigemParaValidar = { id: 'o2', ativo: true, grupoId: GRUPO, pedeDetalhe: true }

test('origem ativa que não pede detalhe passa sem detalhe', () => {
  assert.deepEqual(validarOrigemVenda(INSTAGRAM, null, GRUPO), { ok: true })
})

test('origem inexistente é recusada', () => {
  const r = validarOrigemVenda(undefined, null, GRUPO)
  assert.equal(r.ok, false)
})

test('origem desativada é recusada', () => {
  const r = validarOrigemVenda({ ...INSTAGRAM, ativo: false }, null, GRUPO)
  assert.equal(r.ok, false)
})

test('origem de outro grupo é recusada — venda de BH não usa origem do Sul de Minas', () => {
  const r = validarOrigemVenda({ ...INSTAGRAM, grupoId: 'g-bh' }, null, GRUPO)
  assert.equal(r.ok, false)
})

test('origem que pede detalhe recusa detalhe vazio', () => {
  const r = validarOrigemVenda(INDICACAO, '', GRUPO)
  assert.equal(r.ok, false)
})

test('origem que pede detalhe recusa detalhe só com espaços', () => {
  const r = validarOrigemVenda(INDICACAO, '   ', GRUPO)
  assert.equal(r.ok, false)
})

test('origem que pede detalhe passa com detalhe preenchido', () => {
  assert.deepEqual(validarOrigemVenda(INDICACAO, 'Maria da padaria', GRUPO), { ok: true })
})

test('detalhe de origem que não pede é descartado', () => {
  assert.equal(normalizarDetalhe('sobrou do formulário', false), null)
})

test('detalhe é aparado e vira null quando só tem espaço', () => {
  assert.equal(normalizarDetalhe('  Maria  ', true), 'Maria')
  assert.equal(normalizarDetalhe('   ', true), null)
})

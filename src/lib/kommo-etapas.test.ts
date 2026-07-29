import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etapaDeFechamento } from './kommo-etapas'

test('reconhece as etapas finais do funil', () => {
  assert.equal(etapaDeFechamento('Tem interesse'), true)
  assert.equal(etapaDeFechamento('Em negociação'), true)
  assert.equal(etapaDeFechamento('EM NEGOCIACAO'), true)
  assert.equal(etapaDeFechamento('  Em   Negociação  '), true)
  assert.equal(etapaDeFechamento('Negociação final'), true)
})

test('ignora as etapas iniciais e as de fecho do Kommo', () => {
  assert.equal(etapaDeFechamento('Contato inicial'), false)
  assert.equal(etapaDeFechamento('Pré qualificado'), false)
  assert.equal(etapaDeFechamento('Qualificado'), false)
  assert.equal(etapaDeFechamento('Venda ganha'), false)
  assert.equal(etapaDeFechamento('Venda perdida'), false)
})

test('trata nome ausente', () => {
  assert.equal(etapaDeFechamento(null), false)
  assert.equal(etapaDeFechamento(undefined), false)
  assert.equal(etapaDeFechamento(''), false)
})

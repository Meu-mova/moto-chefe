import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ambienteLiberado, divergenciaDeAmbiente } from './ambiente'

test('homologação passa em qualquer lugar: produção, preview e máquina de dev', () => {
  for (const vercelEnv of ['production', 'preview', 'development', undefined]) {
    assert.equal(ambienteLiberado('Homologacao', vercelEnv), true, String(vercelEnv))
  }
})

test('produção só passa no app publicado em produção', () => {
  assert.equal(ambienteLiberado('Producao', 'production'), true)
  for (const vercelEnv of ['preview', 'development', undefined]) {
    assert.equal(ambienteLiberado('Producao', vercelEnv), false, String(vercelEnv))
  }
})

test('ambiente da nota diferente do grupo: orienta a voltar o ambiente; igual: nada', () => {
  assert.equal(divergenciaDeAmbiente('Producao', 'Producao', 'cancelá-la'), null)
  assert.equal(
    divergenciaDeAmbiente('Producao', 'Homologacao', 'cancelá-la'),
    'Esta nota é de produção e o grupo está em homologação — volte o ambiente em Admin → Notas fiscais para cancelá-la',
  )
})

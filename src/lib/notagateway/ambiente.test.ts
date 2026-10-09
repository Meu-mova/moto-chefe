import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ambienteLiberado } from './ambiente'

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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caminhoDoHolerite } from './holerites-do-grupo'

test('caminho do envio novo começa pelo grupo, depois mês, funcionário e tipo', () => {
  assert.equal(
    caminhoDoHolerite({ grupoId: 'g1', mes: '2026-10', usuarioId: 'u1', tipo: 'salario' }, 'abc'),
    'g1/2026-10/u1-salario-abc.pdf',
  )
})

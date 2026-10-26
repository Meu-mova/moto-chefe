import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acao, RecusaUsuario } from './resultado-action'

test('recusa ao usuário volta como { ok: false, erro } com a frase original', async () => {
  const r = await acao(async () => { throw new RecusaUsuario('CPF inválido') })
  assert.deepEqual(r, { ok: false, erro: 'CPF inválido' })
})

test('sucesso volta como { ok: true, dados }', async () => {
  const r = await acao(async () => ({ id: 'x' }))
  assert.deepEqual(r, { ok: true, dados: { id: 'x' } })
})

test('erro que não é recusa continua sendo lançado', async () => {
  await assert.rejects(acao(async () => { throw new Error('falha do banco') }), /falha do banco/)
})

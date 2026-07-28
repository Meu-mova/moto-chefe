import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tecladoMenu } from './api.ts'
import { CATALOGO } from './perguntas-prontas.ts'

test('tecladoMenu tem um botão por pergunta, callback_data = id', () => {
  const kb = tecladoMenu() as any
  const botoes = kb.inline_keyboard.flat()
  assert.equal(botoes.length, CATALOGO.length)
  for (const p of CATALOGO) {
    assert.ok(botoes.some((b: any) => b.callback_data === p.id && b.text === p.titulo))
  }
})

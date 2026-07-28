import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tecladoMenu, truncarMensagem } from './api'
import { CATALOGO } from './perguntas-prontas'

test('tecladoMenu tem um botão por pergunta, callback_data = id', () => {
  const kb = tecladoMenu() as any
  const botoes = kb.inline_keyboard.flat()
  assert.equal(botoes.length, CATALOGO.length)
  for (const p of CATALOGO) {
    assert.ok(botoes.some((b: any) => b.callback_data === p.id && b.text === p.titulo))
  }
})

test('truncarMensagem respeita limite de 4096 chars', () => {
  const curta = 'Oi'
  assert.equal(truncarMensagem(curta), curta)

  const exatamente4096 = 'a'.repeat(4096)
  assert.equal(truncarMensagem(exatamente4096), exatamente4096)

  const maisDe4096 = 'a'.repeat(4097)
  const truncada = truncarMensagem(maisDe4096)
  assert.equal(truncada.length, 4096)
  assert.ok(truncada.endsWith('…'))
})

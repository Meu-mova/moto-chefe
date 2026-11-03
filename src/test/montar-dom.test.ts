import test from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from './montar-dom'

const g = globalThis as Record<string, unknown>

test('desmontar devolve os globais que existiam antes do montarDom', () => {
  const navegadorAntes = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  g.Element = 'anterior'
  const { dom, desmontar } = montarDom()
  assert.equal(g.window, dom.window)
  assert.equal(g.document, dom.window.document)
  assert.equal(g.IS_REACT_ACT_ENVIRONMENT, true)
  assert.notEqual(g.Element, 'anterior')

  desmontar()

  assert.equal(g.Element, 'anterior')
  assert.equal(g.window, undefined)
  assert.equal(g.document, undefined)
  assert.equal(g.IS_REACT_ACT_ENVIRONMENT, undefined)
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'navigator'), navegadorAntes)
  delete g.Element
})

test('desmontar duas vezes deixa o mesmo estado', () => {
  const { desmontar } = montarDom()
  desmontar()
  desmontar()
  assert.equal(g.window, undefined)
})

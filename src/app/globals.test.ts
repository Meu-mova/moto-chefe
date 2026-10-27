import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
const layoutImpresso = readFileSync(new URL('./(print)/layout.tsx', import.meta.url), 'utf8')

function regra(seletor: string) {
  const i = css.indexOf(`\n${seletor} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}

test('página impressa: html e body sem fundo e esquema claro forçado, para a margem do @page sair branca', () => {
  assert.match(layoutImpresso, /data-impresso/)
  assert.match(regra(':root:has([data-impresso])'), /color-scheme: light !important;[\s\S]*background: transparent;/)
  assert.match(regra(':root:has([data-impresso]) body'), /background: transparent;/)
})

test('a paleta do claro não divide regra com seletor mais específico que o .dark', () => {
  assert.match(css, /\n:root,\n\.tema-claro \{/)
})

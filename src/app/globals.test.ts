import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
const layoutImpresso = readFileSync(new URL('./(print)/layout.tsx', import.meta.url), 'utf8')

function regra(seletor: string) {
  const i = css.indexOf(`\n${seletor} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}

test('layout impresso tem data-impresso e o CSS tem :root:has([data-impresso]) com color-scheme light !important e fundo transparente, e o body dele sem fundo', () => {
  assert.match(layoutImpresso, /data-impresso/)
  assert.match(regra(':root:has([data-impresso])'), /color-scheme: light !important;[\s\S]*background: transparent;/)
  assert.match(regra(':root:has([data-impresso]) body'), /background: transparent;/)
})

test('o CSS abre a paleta do claro com o seletor exato ":root, .tema-claro"', () => {
  assert.match(css, /\n:root,\n\.tema-claro \{/)
})

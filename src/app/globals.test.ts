import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')

function variaveisDoBloco(seletor: RegExp) {
  const corpo = css.match(new RegExp(`${seletor.source}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  return new Set(Array.from(corpo.matchAll(/(--[\w-]+)\s*:/g), (m) => m[1]))
}

test('página com .tema-claro: o bloco do claro vale no html e redefine toda variável que o escuro troca', () => {
  const claro = variaveisDoBloco(/:root,\s*:root:has\(\.tema-claro\),\s*\.tema-claro/)
  const escuro = variaveisDoBloco(/\n\.dark/)
  assert.ok(escuro.size > 0)
  const faltando = [...escuro].filter((v) => !claro.has(v))
  assert.deepEqual(faltando, [])
})

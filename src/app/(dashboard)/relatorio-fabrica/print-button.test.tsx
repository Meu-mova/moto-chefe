import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PrintButton } from './print-button'

// Estoque e Relatório de fábrica usam o botão sem className: o espaço entre o ícone e o texto
// (antes `mr-1.5` no ícone) não pode encolher por causa da folha.
test('sem className, o botão mantém o espaço de 10 px entre o ícone e o texto', () => {
  const html = renderToStaticMarkup(createElement(PrintButton, { href: '/x' }))
  assert.match(html, /class="[^"]*\bgap-2\.5\b/)
  assert.ok(html.includes('Imprimir / PDF'))
})

test('className de quem usa é aplicado ao botão', () => {
  const html = renderToStaticMarkup(createElement(PrintButton, { href: '/x', className: 'h-11' }))
  assert.match(html, /class="[^"]*\bh-11\b/)
})

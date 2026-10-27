import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BotaoTema, ThemeProvider } from './theme-provider'

// Argumentos do script do next-themes que escolhe o tema antes da hidratação:
// (atributo, chave, padrão, forçado, temas, valores, segue o sistema, ...).
function argumentosDoScript(html: string) {
  return html.match(/\("class","theme",("[^"]*"|null),("[^"]*"|null),\[[^\]]*\],null,(true|false)/)?.slice(1) ?? []
}

test('tema começa claro, não é forçado e não segue o sistema', () => {
  const html = renderToStaticMarkup(createElement(ThemeProvider, null, 'conteúdo'))
  assert.deepEqual(argumentosDoScript(html), ['"light"', 'null', 'false'])
})

test('o provedor do tema não põe botão: páginas públicas ficam sem ele', () => {
  const html = renderToStaticMarkup(createElement(ThemeProvider, null, 'conteúdo'))
  assert.ok(!html.includes('data-botao-tema'))
})

test('o botão da barra e o do canto somem no desktop, onde o tema fica no menu do usuário', () => {
  for (const local of ['barra', 'canto'] as const) {
    const tag = renderToStaticMarkup(createElement(BotaoTema, { local })).match(/<div[^>]*>/)?.[0] ?? ''
    assert.match(tag, /class="[^"]*\blg:hidden\b/, local)
  }
})

test('o botão do canto fica preso no canto superior', () => {
  const tag = renderToStaticMarkup(createElement(BotaoTema, { local: 'canto' })).match(/<div[^>]*>/)?.[0] ?? ''
  assert.match(tag, /class="[^"]*\bfixed top-3 right-3\b/)
})

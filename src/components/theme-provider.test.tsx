import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { configTema, ThemeProvider } from './theme-provider'

test('produção: tema claro forçado e sem botão de tema', () => {
  assert.deepEqual(configTema('production', 'production'), { forcedTheme: 'light', botao: false })
})

test('build de produção sem NEXT_PUBLIC_VERCEL_ENV conta como produção', () => {
  assert.deepEqual(configTema(undefined, 'production'), { forcedTheme: 'light', botao: false })
})

test('preview e dev local: tema livre e botão visível', () => {
  assert.deepEqual(configTema('preview', 'production'), { forcedTheme: undefined, botao: true })
  assert.deepEqual(configTema(undefined, 'development'), { forcedTheme: undefined, botao: true })
})

test('em produção o botão não entra no HTML', () => {
  const prod = renderToStaticMarkup(createElement(ThemeProvider, { config: configTema('production', 'production'), children: 'conteúdo' }))
  const preview = renderToStaticMarkup(createElement(ThemeProvider, { config: configTema('preview', 'production'), children: 'conteúdo' }))
  assert.ok(!prod.includes('data-botao-tema'))
  assert.ok(preview.includes('data-botao-tema'))
})

// Cargos escondidos na v1.14.0 (#449): a tela de usuários não mostra o botão Cargos nem a função.
import { JSDOM } from 'jsdom'
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
const g = globalThis as Record<string, unknown>
g.window = dom.window; g.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'HTMLButtonElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'NodeList', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  g[k] = (dom.window as unknown as Record<string, unknown>)[k]
}
g.IS_REACT_ACT_ENVIRONMENT = true

const nada = async () => ({ ok: true })
mock.module('../actions', { namedExports: { criarUsuarioAction: nada, editarUsuarioAction: nada, excluirUsuarioAction: nada, alternarAtivoUsuarioAction: nada } })
mock.module('../cargos-actions', { namedExports: { criarCargoAction: nada, editarCargoAction: nada, apagarCargoAction: nada } })

test('tela de usuários sem o botão Cargos (#449)', async () => {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { UsuariosTable } = await import('./usuarios-table')
  const { limitesDaTela } = await import('@/lib/gestao-usuarios')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const limites = limitesDaTela({ id: 's', papel: 'admin_socio', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false })
  await act(async () => {
    createRoot(container).render(React.createElement(UsuariosTable, {
      usuarios: [], lojas: [], grupos: [], limites,
      cargos: [{ id: 'c1', nome: 'Recepção', modulos: ['clientes'], contaId: 'A' }], contaAtiva: 'A', podeDarAoCargo: ['clientes'],
    }))
  })
  const botoes = [...container.querySelectorAll('button')].map(b => b.textContent?.trim())
  assert.ok(botoes.includes('Novo usuário'))
  assert.ok(!botoes.includes('Cargos'), botoes.join(', '))
})

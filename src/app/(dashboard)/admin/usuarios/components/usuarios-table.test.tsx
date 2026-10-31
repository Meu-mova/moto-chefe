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
const chamadas: string[] = []
const alternar = async (_id: string, ativo: boolean) => { chamadas.push(ativo ? 'reativar' : 'desativar'); return { ok: true } }
const excluir = async () => { chamadas.push('excluir'); return { ok: true } }
mock.module('../actions', { namedExports: { criarUsuarioAction: nada, editarUsuarioAction: nada, excluirUsuarioAction: excluir, alternarAtivoUsuarioAction: alternar } })
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
      cargos: [{ id: 'c1', nome: 'Recepção', modulos: ['clientes'], contaId: 'A' }], contaAtiva: 'A', podeDarAoCargo: ['clientes'], liberaveis: null, liberadosPorUsuario: {},
    }))
  })
  const botoes = [...container.querySelectorAll('button')].map(b => b.textContent?.trim())
  assert.ok(botoes.includes('Novo usuário'))
  assert.ok(!botoes.includes('Cargos'), botoes.join(', '))
})

// Bot de revisão do #558: o painel guardava o usuário antigo; o segundo clique repetia a ação.
test('painel (#558): desativar e depois reativar alterna de verdade; excluir fecha o painel', async () => {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { UsuariosTable } = await import('./usuarios-table')
  const { limitesDaTela } = await import('@/lib/gestao-usuarios')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const limites = limitesDaTela({ id: 'geral', papel: 'admin_geral', gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false })
  const usuario = { id: 'u1', nome: 'Helena Prado', email: 'helena@exemplo.com', papel: 'vendedor', papeisExtras: [], lojaId: null, lojaNome: 'Loja Centro', conecta: null,
    gruposAprovacao: [], aprovaPagamentoSensivel: false, gruposAcesso: [], grupoDaLojaId: null, ativo: true, modulosExtras: [], modulosBloqueados: [], cargoId: null, contaId: 'A' }
  await act(async () => {
    createRoot(container).render(React.createElement(UsuariosTable, {
      usuarios: [usuario], lojas: [], grupos: [], limites, cargos: [], contaAtiva: 'A', podeDarAoCargo: [], liberaveis: null, liberadosPorUsuario: {},
    }))
  })
  const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === texto)
  const clicar = async (el: Element | undefined) => { assert.ok(el); await act(async () => { (el as HTMLElement).click() }) }
  await clicar([...document.querySelectorAll('button')].find(b => b.textContent?.includes('Helena Prado')))
  chamadas.length = 0
  await clicar(botao('Desativar'))
  await clicar(botao('Reativar'))
  assert.deepEqual(chamadas, ['desativar', 'reativar'])
  await clicar(botao('Excluir'))
  const confirmar = [...document.querySelectorAll('[role=dialog] button')].filter(b => b.textContent?.trim() === 'Excluir').pop()
  await clicar(confirmar)
  assert.equal(chamadas.at(-1), 'excluir')
  assert.ok(![...document.querySelectorAll('h2')].some(h => h.textContent?.includes('Helena Prado')), 'o painel fechou')
})

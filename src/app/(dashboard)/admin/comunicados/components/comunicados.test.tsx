// Comunicados (#621): o papel dos destinatários aparece com o texto único das telas internas.
import { JSDOM } from 'jsdom'
import test, { afterEach, mock } from 'node:test'
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
mock.module('../actions', { namedExports: { criarComunicadoAction: nada, toggleAtivoAction: nada, excluirComunicadoAction: nada } })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
})

async function montar(elemento: (React: typeof import('react')) => import('react').ReactElement) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const raiz = createRoot(container)
  raizes.push(raiz)
  await act(async () => { raiz.render(elemento(React)) })
}

test('lista: destinatários aparecem com o rótulo único, não com a forma curta', async () => {
  const { ComunicadosTable } = await import('./comunicados-table')
  const c = { id: '1', titulo: 'Aviso', conteudo: 'Texto', ativo: true, papeis: ['aux_adm', 'admin_socio'], dataPostagem: null, criadoEm: new Date('2026-11-01T12:00:00Z'), totalLidos: 0 }
  await montar(React => React.createElement(ComunicadosTable, { comunicados: [c] }))
  assert.ok(document.body.textContent?.includes('Aux. Administrativo, Admin Sócio'))
})

test('formulário: oferece os seis papéis que comunicado aceita, com o rótulo único', async () => {
  const { ComunicadoForm } = await import('./comunicado-form')
  await montar(React => React.createElement(ComunicadoForm))
  const botoes = [...document.querySelectorAll('button[type=button]')].map(b => b.textContent?.trim())
  const papeis = ['Admin Geral', 'Admin Sócio', 'Aux. Administrativo', 'Vendedor', 'Mecânico', 'Motorista']
  assert.deepEqual(botoes.filter(t => papeis.includes(t ?? '')), papeis)
  assert.ok(!botoes.includes('Admin de Rede') && !botoes.includes('Cargo da Conta'))
})

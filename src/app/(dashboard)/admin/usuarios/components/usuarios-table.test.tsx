// Tela de usuários e diálogo de cargos (#616): só o admin_geral vê e usa os cargos.
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
const chamadas: string[] = []
const alternar = async (_id: string, ativo: boolean) => { chamadas.push(ativo ? 'reativar' : 'desativar'); return { ok: true } }
const excluir = async () => { chamadas.push('excluir'); return { ok: true } }
const criadas: unknown[] = []
const criarCargo = async (dados: unknown) => { criadas.push(dados); return { ok: true } }
mock.module('../actions', { namedExports: { criarUsuarioAction: nada, editarUsuarioAction: nada, excluirUsuarioAction: excluir, alternarAtivoUsuarioAction: alternar } })
mock.module('../cargos-actions', { namedExports: { criarCargoAction: criarCargo, editarCargoAction: nada, apagarCargoAction: nada } })

// Cada teste desmonta o que montou: teste que falha no meio não suja o seguinte.
const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
})

const gestor = (papel: string) => ({ id: 'g', papel, gruposVisiveis: [], gruposAprovacao: [], itensLiberaveis: [], aprovaPagamentoSensivel: false })
const cargoGerente = { id: 'c1', nome: 'Gerente', papelBase: 'aux_adm', contaId: 'A' }
const base = { id: 'u', email: 'u@exemplo.com', papeisExtras: [], lojaId: null, lojaNome: 'Loja Centro', conecta: null, gruposAprovacao: [],
  aprovaPagamentoSensivel: false, gruposAcesso: [], grupoDaLojaId: null, ativo: true, modulosExtras: [], modulosBloqueados: [], contaId: 'A' }
const marina = { ...base, id: 'u1', nome: 'Marina Costa', papel: 'cargo', cargoId: 'c1' }
const bruno = { ...base, id: 'u2', nome: 'Bruno Alves', papel: 'vendedor', cargoId: null }

async function montar(papel: string, usuarios: object[] = []) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { UsuariosTable } = await import('./usuarios-table')
  const { limitesDaTela } = await import('@/lib/gestao-usuarios')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const raiz = createRoot(container)
  raizes.push(raiz)
  await act(async () => {
    raiz.render(React.createElement(UsuariosTable, {
      usuarios: usuarios as never, lojas: [], grupos: [], limites: limitesDaTela(gestor(papel)),
      cargos: [cargoGerente] as never, contaAtiva: 'A', liberaveis: null, liberadosPorUsuario: {},
    }))
  })
  return container
}
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === texto)
async function clicar(el: Element | null | undefined) { const { act } = await import('react'); assert.ok(el); await act(async () => { (el as HTMLElement).click() }) }

test('botão Cargos só para o admin_geral; sócio não o vê (#616)', async () => {
  await montar('admin_socio')
  assert.ok(!botao('Cargos'), 'sócio')
  document.body.innerHTML = ''
  await montar('admin_geral')
  assert.ok(botao('Cargos'), 'admin_geral')
})

test('diálogo de cargos: a escolha da base mostra o que cada base faz e grava nome e base (#616)', async () => {
  await montar('admin_geral', [marina])
  await clicar(botao('Cargos'))
  // Lista: nome, base e número de usuários.
  assert.ok(document.body.textContent?.includes('Base Adm. da loja, 1 usuário'))
  await clicar(botao('Novo cargo'))
  const linha = (rotulo: string) => [...document.querySelectorAll('[role=dialog] tbody tr')].find(tr => tr.querySelector('label')?.textContent?.trim() === rotulo)
  assert.equal(document.querySelectorAll('[role=dialog] tbody tr').length, 5, 'uma linha por base')
  assert.ok(linha('Adm. da loja')?.textContent?.includes('sem NF'), 'adm. da loja cancela só venda sem NF')
  assert.equal(linha('Vendedor')?.textContent?.match(/não/g)?.length, 4, 'vendedor não faz nenhuma das quatro')
  assert.ok(document.body.textContent?.includes('Escolha uma base'))

  const { act } = await import('react')
  await clicar(botao('Criar cargo'))
  assert.deepEqual(criadas, [], 'sem nome e sem base, nada é enviado')

  const nome = document.getElementById('nome-cargo') as HTMLInputElement
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
    set.call(nome, 'Gerente_admin'); nome.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await clicar(linha('Sócio')?.querySelector('input'))
  assert.ok(document.body.textContent?.includes('as '), 'resumo das telas da base')
  await clicar(botao('Criar cargo'))
  assert.deepEqual(criadas, [{ nome: 'Gerente_admin', papelBase: 'admin_socio' }])
})

test('lista de usuários: quem tem cargo mostra o cargo e a base; papel fixo, não (#616)', async () => {
  const container = await montar('admin_geral', [marina, bruno])
  assert.ok(container.textContent?.includes('Cargo da Conta, base Adm. da loja'))
  assert.equal(container.textContent?.match(/Cargo da Conta, base/g)?.length, 2, 'uma vez na tabela e outra na lista do celular')
  assert.ok(container.textContent?.includes('Gerente'))
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
      usuarios: [usuario], lojas: [], grupos: [], limites, cargos: [], contaAtiva: 'A', liberaveis: null, liberadosPorUsuario: {},
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

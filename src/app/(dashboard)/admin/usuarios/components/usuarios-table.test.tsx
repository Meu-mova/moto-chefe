// Tela de usuários e diálogo de cargos (#616, #617): cargos só para quem gerencia cargos.
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
// O que o editar manda à action: é o que o servidor lê para manter, atribuir ou tirar o cargo.
const editadas: { id: string; dados: Record<string, unknown> }[] = []
const editar = async (id: string, dados: Record<string, unknown>) => { editadas.push({ id, dados }); return { ok: true } }
const chamadas: string[] = []
const alternar = async (_id: string, ativo: boolean) => { chamadas.push(ativo ? 'reativar' : 'desativar'); return { ok: true } }
const excluir = async () => { chamadas.push('excluir'); return { ok: true } }
const criadas: unknown[] = []
// Segura a resposta do envio para o teste olhar o diálogo enquanto ele está enviando.
let segurarEnvio: Promise<void> = Promise.resolve()
const criarCargo = async (dados: unknown) => { criadas.push(dados); await segurarEnvio; return { ok: true } }
mock.module('../actions', { namedExports: { criarUsuarioAction: nada, editarUsuarioAction: editar, excluirUsuarioAction: excluir, alternarAtivoUsuarioAction: alternar } })
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
const cargoCaixa = { id: 'c2', nome: 'Caixa', papelBase: 'aux_adm', contaId: 'A' }
const base = { id: 'u', email: 'u@exemplo.com', papeisExtras: [], lojaId: null, lojaNome: 'Loja Centro', conecta: null, gruposAprovacao: [],
  aprovaPagamentoSensivel: false, gruposAcesso: [], grupoDaLojaId: null, ativo: true, modulosExtras: [], modulosBloqueados: [], contaId: 'A' }
const marina = { ...base, id: 'u1', nome: 'Marina Costa', papel: 'cargo', cargoId: 'c1' }
const bruno = { ...base, id: 'u2', nome: 'Bruno Alves', papel: 'vendedor', cargoId: null }

type Opcoes = { gestor?: object; grupos?: object[]; lojas?: object[]; cargos?: object[] }

async function montar(papel: string, usuarios: object[] = [], opcoes: Opcoes = {}) {
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
      usuarios: usuarios as never, lojas: (opcoes.lojas ?? []) as never, grupos: (opcoes.grupos ?? []) as never, limites: limitesDaTela({ ...gestor(papel), ...opcoes.gestor }),
      cargos: (opcoes.cargos ?? [cargoGerente, cargoCaixa]) as never, contaAtiva: 'A', liberaveis: null, liberadosPorUsuario: {},
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

test('sócio com a permissão de cargos vê o botão Cargos (#617)', async () => {
  await montar('admin_socio', [], { gestor: { podeCargos: true } })
  assert.ok(botao('Cargos'))
})

const abaModulos = () => [...document.querySelectorAll('[role=tab]')].find(t => t.textContent?.trim() === 'Módulos')
const caixaDe = (rotulo: string) => [...document.querySelectorAll('label')].find(l => l.textContent?.includes(rotulo))?.querySelector('input')
const adminRede = { ...base, id: 'u3', nome: 'Usuário Rede', papel: 'admin_rede', cargoId: null }

test('o admin_geral oferece Gerenciar cargos a sócio e a admin de rede, e a liga no payload (#617)', async () => {
  await montar('admin_geral', [adminRede])
  const dados = await salvarEdicaoDe('Usuário Rede', async () => {
    await clicar(abaModulos())
    await clicar(caixaDe('Gerenciar cargos'))
  })
  assert.deepEqual(dados.modulosExtras, ['cargos'])
})

const socioAlvo = { ...base, id: 'u6', nome: 'Usuário Sócio', papel: 'admin_socio', cargoId: null }
const socioComPermissao = { ...socioAlvo, id: 'u7', nome: 'Usuário Sócio Liberado', modulosExtras: ['cargos'] }
// Mesmo com 'cargos' entre as telas que o gestor vê, a tela não o oferece: só o admin_geral liga.
const gestorSocio = { itensLiberaveis: ['vendas', 'entrada', 'cargos'] }

test('o sócio não vê a caixa Gerenciar cargos de um sócio que não a tem (#617)', async () => {
  await montar('admin_socio', [socioAlvo], { gestor: gestorSocio })
  await clicar([...document.querySelectorAll('button')].find(b => b.textContent?.includes('Usuário Sócio')))
  await clicar(abaModulos())
  assert.ok(!caixaDe('Gerenciar cargos'))
})

test('o sócio vê a caixa de quem já tem a permissão, marcada e travada (#617)', async () => {
  await montar('admin_socio', [socioComPermissao], { gestor: gestorSocio })
  await clicar([...document.querySelectorAll('button')].find(b => b.textContent?.includes('Usuário Sócio Liberado')))
  await clicar(abaModulos())
  assert.equal(caixaDe('Gerenciar cargos')?.checked, true)
  assert.equal(caixaDe('Gerenciar cargos')?.disabled, true, 'sócio não desliga')
})

test('o admin_geral liga e desliga a caixa Gerenciar cargos (#617)', async () => {
  await montar('admin_geral', [socioComPermissao])
  await clicar([...document.querySelectorAll('button')].find(b => b.textContent?.includes('Usuário Sócio Liberado')))
  await clicar(abaModulos())
  assert.equal(caixaDe('Gerenciar cargos')?.disabled, false)
})

test('cargo com base Sócio mostra Aprovação e Acesso a grupos, e manda as marcações no payload (#617)', async () => {
  const gerenteAdmin = { id: 'c3', nome: 'Gerente_admin', papelBase: 'admin_socio', contaId: 'A' }
  const grupos = [{ id: 'gA', nome: 'Grupo A', contaId: 'A' }, { id: 'gB', nome: 'Grupo B', contaId: 'A' }]
  const lojas = [{ id: 'l1', nome: 'Loja Centro', grupoId: 'gA' }]
  const ana = { ...base, id: 'u4', nome: 'Gerente A', papel: 'cargo', cargoId: 'c3', lojaId: 'l1', grupoDaLojaId: 'gA' }
  const bia = { ...ana, id: 'u5', nome: 'Gerente B', cargoId: 'c1' }
  await montar('admin_geral', [ana, bia], { grupos, lojas, cargos: [gerenteAdmin, cargoGerente] })
  const abas = () => [...document.querySelectorAll('[role=tab]')].map(t => t.textContent?.trim())
  const dados = await salvarEdicaoDe('Gerente A', async () => {
    assert.ok(abas().includes('Aprovação'), 'aprovação aparece para cargo base Sócio')
    await clicar([...document.querySelectorAll('[role=tab]')].find(t => t.textContent?.trim() === 'Aprovação'))
    await clicar(caixaDe('Grupo B'))
  })
  assert.deepEqual(dados.gruposAprovacao, ['gB'])
  // Base Adm. da loja não aprova: a aba não aparece e nada é enviado.
  const semAprovacao = await salvarEdicaoDe('Gerente B', async () => assert.ok(!abas().includes('Aprovação')))
  assert.deepEqual(semAprovacao.gruposAprovacao, [])
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
  assert.ok(document.body.textContent?.includes('Aprovar venda vale só nos grupos marcados'), 'aprovar depende dos grupos de aprovação do cadastro')

  const { act } = await import('react')
  await clicar(botao('Criar cargo'))
  assert.deepEqual(criadas, [], 'sem nome e sem base, nada é enviado')

  const nome = document.getElementById('nome-cargo') as HTMLInputElement
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
    set.call(nome, 'Gerente_admin'); nome.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await clicar(linha('Sócio')?.querySelector('input'))
  const { oQueABaseFaz } = await import('@/lib/base-do-cargo')
  assert.ok(document.body.textContent?.includes(`Telas: as ${oQueABaseFaz('admin_socio').telas.length} telas do papel Sócio.`), 'resumo das telas da base escolhida')
  await clicar(botao('Criar cargo'))
  assert.deepEqual(criadas, [{ nome: 'Gerente_admin', papelBase: 'admin_socio' }])
})

test('enquanto o cargo é enviado, nome e rádios ficam travados; as colunas têm cabeçalho (#616)', async () => {
  await montar('admin_geral', [marina])
  await clicar(botao('Cargos'))
  await clicar(botao('Novo cargo'))
  const { act } = await import('react')
  const nome = document.getElementById('nome-cargo') as HTMLInputElement
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
    set.call(nome, 'Gerente_admin'); nome.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  assert.equal(document.querySelectorAll('[role=dialog] thead th[scope=col]').length, 5, 'Base e as 4 colunas')
  const radios = () => [...document.querySelectorAll<HTMLInputElement>('[role=dialog] input[type=radio]')]
  await clicar(radios()[1])
  let liberar!: () => void
  segurarEnvio = new Promise<void>(r => { liberar = r })
  await clicar(botao('Criar cargo'))
  assert.equal(nome.disabled, true, 'nome travado')
  assert.ok(radios().every(r => r.disabled), 'rádios travados')
  await act(async () => { liberar() })
  segurarEnvio = Promise.resolve()
})

async function salvarEdicaoDe(nome: string, antes?: () => Promise<void>) {
  await clicar([...document.querySelectorAll('button')].find(b => b.textContent?.includes(nome)))
  await antes?.()
  editadas.length = 0
  await clicar(botao('Salvar'))
  assert.equal(editadas.length, 1)
  return editadas[0].dados
}

test('editar usuário manda o cargo que ele tem, para o servidor mantê-lo (#616)', async () => {
  await montar('admin_socio', [marina])
  assert.equal((await salvarEdicaoDe('Marina Costa')).cargoId, 'c1')
})

test('editar usuário manda o cargo novo escolhido; papel fixo manda cargoId nulo (#616)', async () => {
  const { act } = await import('react')
  await montar('admin_geral', [marina, bruno])
  const novo = await salvarEdicaoDe('Marina Costa', async () => {
    const select = document.getElementById('cargo-usuario') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!.call(select, 'c2')
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
  })
  assert.equal(novo.cargoId, 'c2')
  assert.equal((await salvarEdicaoDe('Bruno Alves')).cargoId, null)
})

test('só a tabela de bases rola na horizontal: o fieldset pode encolher abaixo da largura da tabela (#616)', async () => {
  await montar('admin_geral', [marina])
  await clicar(botao('Cargos'))
  await clicar(botao('Novo cargo'))
  const campos = document.querySelector('[role=dialog] fieldset')
  const rolagem = campos?.querySelector('.overflow-x-auto')
  assert.ok(rolagem?.querySelector('table'), 'a tabela está dentro do que rola')
  // O JSDOM não tem layout: o fieldset nasce com largura mínima igual à do conteúdo, e só
  // `min-w-0` deixa o contêiner de rolagem encolher (falha vista a 360 px na Etapa 6).
  assert.ok(campos?.classList.contains('min-w-0'))
})

test('lista de usuários: cargo com base Sócio mostra onde aprova; base Adm. da loja, não (#617)', async () => {
  const gerenteAdmin = { id: 'c3', nome: 'Cargo Sócio', papelBase: 'admin_socio', contaId: 'A' }
  const sociaDoCargo = { ...base, id: 'u4', nome: 'Usuário Cargo Sócio', papel: 'cargo', cargoId: 'c3', grupoDaLojaId: 'gA' }
  const container = await montar('admin_geral', [sociaDoCargo, marina], { cargos: [gerenteAdmin, cargoGerente] })
  const linhas = [...container.querySelectorAll('tbody tr')]
  const da = (nome: string) => linhas.find(l => l.textContent?.includes(nome))?.textContent ?? ''
  assert.ok(da('Usuário Cargo Sócio').includes('1 grupo'))
  assert.ok(da('Marina Costa').includes('Não aprova'))
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

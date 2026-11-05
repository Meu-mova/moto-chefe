// Aba Comissões (#630). jsdom não executa container query: qual faixa mostra o quê e o alvo de
// 44 px são CSS e ficam para o navegador; aqui vão o conteúdo, a abertura do detalhe, o formulário
// e o que a tela manda às Server Actions.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { RegraRow } from './regras-comissao-table'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)

// Fronteira de fora: as Server Actions, o toast e as caixas nativas (prompt/confirm).
const criadas: unknown[] = []
const encerradas: unknown[][] = []
const excluidas: unknown[] = []
const erros: string[] = []
const sucessos: string[] = []
let falhaDaCriacao: Error | null = null
let travaEncerrar: Promise<void> | null = null
const acoesMock = mock.module('../actions', {
  namedExports: {
    criarRegraComissaoAction: async (d: unknown) => { if (falhaDaCriacao) throw falhaDaCriacao; criadas.push(d) },
    encerrarRegraComissaoAction: async (...a: unknown[]) => { encerradas.push(a); await travaEncerrar },
    excluirRegraComissaoAction: async (id: unknown) => { excluidas.push(id) },
  },
})
const toastMock = mock.module('sonner', {
  namedExports: { toast: { error: (m: string) => { erros.push(m) }, success: (m: string) => { sucessos.push(m) } } },
})
after(() => { acoesMock.restore(); toastMock.restore() })

const g = globalThis as Record<string, unknown>
let respostaDoPrompt: string | null = '2026-12'
let respostaDoConfirm = true
const promptsFeitos: unknown[][] = []
g.prompt = (...a: unknown[]) => { promptsFeitos.push(a); return respostaDoPrompt }
g.confirm = () => respostaDoConfirm

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  for (const l of [criadas, encerradas, excluidas, erros, sucessos, promptsFeitos]) l.length = 0
  falhaDaCriacao = null
  travaEncerrar = null
  respostaDoPrompt = '2026-12'
  respostaDoConfirm = true
})

const regra = (r: Partial<RegraRow> & Pick<RegraRow, 'id' | 'usuarioNome'>): RegraRow => ({
  usuarioId: 'u-' + r.usuarioNome, tipo: 'comissao', base: 'proprias_motos', percentual: '1.00',
  vigenciaInicio: null, vigenciaFim: null, descricao: null, lojaNome: 'Loja Centro', ...r,
})
const r1 = regra({ id: 'r1', usuarioNome: 'Vendedor A' })
const r2 = regra({ id: 'r2', usuarioNome: 'Vendedor A', tipo: 'premiacao', base: 'loja_motos', percentual: '0.05', vigenciaInicio: '2026-09', vigenciaFim: '2026-12', descricao: 'Combinada em setembro' })
const r3 = regra({ id: 'r3', usuarioNome: 'Vendedor B', lojaNome: 'Loja Norte', tipo: 'premiacao', base: 'proprias_pecas', percentual: '2.00', vigenciaInicio: '2026-11' })
const funcionarios = [{ id: 'u-Vendedor A', nome: 'Vendedor A', lojaId: 'l1' }, { id: 'u-Vendedor B', nome: 'Vendedor B', lojaId: 'l2' }]

async function montar(regras: RegraRow[] = [r1, r2, r3]) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { RegrasComissaoTable } = await import('./regras-comissao-table')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const raiz = createRoot(el)
  raizes.push(raiz)
  await act(async () => { raiz.render(React.createElement(RegrasComissaoTable, { regras, funcionarios, mes: '2026-10' })) })
  return el
}

const linhas = () => [...document.querySelectorAll<HTMLElement>('[role="table"] > [role="row"]')].filter(l => !l.querySelector('[role="columnheader"]'))
const linhaDe = (id: string) => linhas()[['r1', 'r2', 'r3'].indexOf(id)]!
const setaDe = (id: string) => linhaDe(id).querySelector<HTMLButtonElement>('button[aria-label^="Ver detalhes"]')!
const acao = (id: string, verbo: 'Encerrar' | 'Apagar') => linhaDe(id).querySelector<HTMLButtonElement>(`button[aria-label^="${verbo} regra"]`)!
const campoDo = (rotulo: string) => [...document.querySelectorAll('label')].find(l => l.textContent?.startsWith(rotulo))!.querySelector('input, select') as HTMLInputElement
const cadastrar = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Cadastrar regra')!
const texto = () => document.body.textContent ?? ''

async function clicar(el: Element) {
  const { act } = await import('react')
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}
async function preencher(el: HTMLInputElement, valor: string) {
  const { act } = await import('react')
  const proto = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valor)
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}

test('a lista é plana, na ordem recebida: quem tem duas regras aparece em duas linhas seguidas', async () => {
  await montar()
  const nomes = linhas().map(l => l.querySelector('p')?.textContent)
  assert.deepEqual(nomes, ['Vendedor A', 'Vendedor A', 'Vendedor B'])
  assert.match(linhaDe('r3').textContent ?? '', /Loja Norte/)
})

test('cada regra mostra o tipo, a base e o percentual como na tela de hoje', async () => {
  await montar()
  assert.match(linhaDe('r1').textContent ?? '', /Comissão.*Motos vendidas por ele.*1,0%/)
  assert.match(linhaDe('r2').textContent ?? '', /Premiação.*Motos da loja.*0,05%/)
})

test('a vigência diz o que vale; só a regra fora do mês ganha "não vale em"', async () => {
  await montar()
  assert.match(linhaDe('r1').textContent ?? '', /Vale sempre/)
  assert.match(linhaDe('r2').textContent ?? '', /Vale de set\/2026 a dez\/2026/)
  assert.match(linhaDe('r3').textContent ?? '', /Vale desde nov\/2026/)
  assert.doesNotMatch(linhaDe('r1').textContent ?? '', /não vale em/)
  assert.doesNotMatch(linhaDe('r2').textContent ?? '', /não vale em/)
  assert.match(linhaDe('r3').textContent ?? '', /não vale em out\/2026/)
})

test('a seta abre e fecha o detalhe da regra, e só dela', async () => {
  await montar()
  assert.equal(setaDe('r2').getAttribute('aria-expanded'), 'false')
  await clicar(setaDe('r2'))
  assert.equal(setaDe('r2').getAttribute('aria-expanded'), 'true')
  assert.equal(setaDe('r1').getAttribute('aria-expanded'), 'false')
  await clicar(setaDe('r2'))
  assert.equal(setaDe('r2').getAttribute('aria-expanded'), 'false')
})

test('o detalhe traz a observação, ou diz que não há', async () => {
  await montar()
  assert.match(linhaDe('r2').textContent ?? '', /Combinada em setembro/)
  assert.match(linhaDe('r1').textContent ?? '', /Sem observação/)
})

test('Encerrar e Apagar são botões com nome acessível que cita a pessoa', async () => {
  await montar()
  assert.equal(acao('r1', 'Encerrar').getAttribute('aria-label'), 'Encerrar regra de Vendedor A')
  assert.equal(acao('r3', 'Apagar').getAttribute('aria-label'), 'Apagar regra de Vendedor B')
})

test('Encerrar pergunta o mês (com o mês da folha de sugestão) e manda o que foi digitado', async () => {
  await montar()
  await clicar(acao('r2', 'Encerrar'))
  assert.equal(promptsFeitos[0]![1], '2026-10')
  assert.deepEqual(encerradas, [['r2', '2026-12']])
  assert.deepEqual(sucessos, ['Regra encerrada'])
})

test('Encerrar cancelado no prompt não chama a action', async () => {
  await montar()
  respostaDoPrompt = null
  await clicar(acao('r2', 'Encerrar'))
  assert.equal(encerradas.length, 0)
})

test('Apagar só chama a action depois do "sim" na confirmação', async () => {
  await montar()
  respostaDoConfirm = false
  await clicar(acao('r1', 'Apagar'))
  assert.equal(excluidas.length, 0)
  respostaDoConfirm = true
  await clicar(acao('r1', 'Apagar'))
  assert.deepEqual(excluidas, ['r1'])
  assert.deepEqual(sucessos, ['Regra removida'])
})

test('enquanto uma ação roda, Encerrar e Apagar de todas as regras ficam desabilitados', async () => {
  const { act } = await import('react')
  await montar()
  let soltar!: () => void
  travaEncerrar = new Promise<void>(r => { soltar = r })
  await clicar(acao('r1', 'Encerrar'))
  assert.equal(acao('r2', 'Apagar').disabled, true)
  assert.equal(acao('r1', 'Encerrar').disabled, true)
  await act(async () => { soltar(); await travaEncerrar })
  assert.equal(acao('r2', 'Apagar').disabled, false)
})

test('"Nova regra" nasce fechada e abre pelo resumo, com todos os campos de hoje', async () => {
  await montar()
  const caixa = document.querySelector('details')!
  assert.equal(caixa.open, false)
  assert.match(caixa.querySelector('summary')!.textContent ?? '', /Nova regra/)
  await clicar(caixa.querySelector('summary')!)
  assert.equal(caixa.open, true)
  for (const rotulo of ['Funcionário', 'Tipo', 'Base de cálculo', 'Percentual (%)', 'Vale a partir de', 'Até (opcional)', 'Observação']) {
    assert.ok(campoDo(rotulo), rotulo)
  }
  assert.equal(campoDo('Vale a partir de').value, '2026-10')
})

test('Cadastrar regra fica desabilitado até escolher o funcionário', async () => {
  await montar()
  assert.equal(cadastrar().disabled, true)
  await preencher(campoDo('Funcionário'), 'u-Vendedor B')
  assert.equal(cadastrar().disabled, false)
})

test('Cadastrar manda à action os sete campos, com o percentual lido como número', async () => {
  await montar()
  await preencher(campoDo('Funcionário'), 'u-Vendedor B')
  await preencher(campoDo('Tipo'), 'premiacao')
  await preencher(campoDo('Base de cálculo'), 'loja_total')
  await preencher(campoDo('Percentual (%)'), '0,2')
  await preencher(campoDo('Até (opcional)'), '2027-03')
  await preencher(campoDo('Observação'), 'Meta de fim de ano')
  await clicar(cadastrar())
  assert.deepEqual(criadas, [{
    usuarioId: 'u-Vendedor B', tipo: 'premiacao', base: 'loja_total', percentual: 0.2,
    vigenciaInicio: '2026-10', vigenciaFim: '2027-03', descricao: 'Meta de fim de ano',
  }])
  assert.deepEqual(sucessos, ['Regra cadastrada'])
})

test('depois de cadastrar, limpa percentual, observação e fim e mantém o resto', async () => {
  await montar()
  await preencher(campoDo('Funcionário'), 'u-Vendedor B')
  await preencher(campoDo('Percentual (%)'), '0,2')
  await preencher(campoDo('Até (opcional)'), '2027-03')
  await preencher(campoDo('Observação'), 'x')
  await clicar(cadastrar())
  assert.equal(campoDo('Percentual (%)').value, '')
  assert.equal(campoDo('Até (opcional)').value, '')
  assert.equal(campoDo('Observação').value, '')
  assert.equal(campoDo('Funcionário').value, 'u-Vendedor B')
  assert.equal(campoDo('Vale a partir de').value, '2026-10')
})

test('percentual inválido não chega à action', async () => {
  await montar()
  await preencher(campoDo('Funcionário'), 'u-Vendedor B')
  await preencher(campoDo('Percentual (%)'), 'abc')
  await clicar(cadastrar())
  assert.deepEqual(erros, ['Percentual inválido'])
  assert.equal(criadas.length, 0)
})

test('erro da action vira aviso com a mensagem dela e não limpa o formulário', async () => {
  await montar()
  falhaDaCriacao = new Error('Regra já cadastrada')
  await preencher(campoDo('Funcionário'), 'u-Vendedor B')
  await preencher(campoDo('Percentual (%)'), '0,2')
  await clicar(cadastrar())
  assert.deepEqual(erros, ['Regra já cadastrada'])
  assert.equal(campoDo('Percentual (%)').value, '0,2')
})

test('sem regras, diz que nenhuma foi cadastrada', async () => {
  await montar([])
  assert.match(texto(), /Nenhuma regra cadastrada/)
})

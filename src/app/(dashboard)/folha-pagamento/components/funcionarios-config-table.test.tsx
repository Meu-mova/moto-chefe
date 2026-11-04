// Aba Funcionários (#630). jsdom não executa container query: qual faixa mostra o quê (celular,
// tablet, desktop) e o alvo de 44 px são CSS e ficam para o navegador; aqui vão o conteúdo, o
// estado dos campos e o que a tela manda à Server Action.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { FuncionarioRow } from './funcionarios-config-table'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)

// Fronteira de fora: a Server Action e o toast.
const salvas: unknown[][] = []
const erros: string[] = []
const sucessos: string[] = []
let falhaDaAcao: Error | null = null
const acaoMock = mock.module('../actions', {
  namedExports: {
    salvarConfigFuncionarioAction: async (...args: unknown[]) => {
      if (falhaDaAcao) throw falhaDaAcao
      salvas.push(args)
    },
  },
})
const toastMock = mock.module('sonner', {
  namedExports: { toast: { error: (m: string) => { erros.push(m) }, success: (m: string) => { sucessos.push(m) } } },
})
after(() => { acaoMock.restore(); toastMock.restore() })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  salvas.length = 0
  erros.length = 0
  sucessos.length = 0
  falhaDaAcao = null
})

const regraCom = { tipo: 'comissao', base: 'proprias_motos', percentual: '1.00', vigenciaInicio: null, vigenciaFim: null }
const regraPrem = { tipo: 'premiacao', base: 'loja_motos', percentual: '0.05', vigenciaInicio: null, vigenciaFim: null }
const ana: FuncionarioRow = { usuarioId: 'a', nome: 'Vendedor A', papel: 'vendedor', lojaNome: 'Loja Centro', salario: '2450.00',
  ajudaCusto: '300.00', adiantamentoFixo: '800.00', ativo: true, regras: [regraCom, regraPrem] }
const gil: FuncionarioRow = { usuarioId: 'g', nome: 'Vendedor G', papel: 'vendedor', lojaNome: 'Loja Sul', salario: '2450.00',
  ajudaCusto: null, adiantamentoFixo: null, ativo: false, regras: [] }

let renderizar: (funcionarios: FuncionarioRow[]) => Promise<void> = async () => {}

async function montar(funcionarios: FuncionarioRow[] = [ana, gil]) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { FuncionariosConfigTable } = await import('./funcionarios-config-table')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const raiz = createRoot(el)
  raizes.push(raiz)
  renderizar = novos => act(async () => { raiz.render(React.createElement(FuncionariosConfigTable, { funcionarios: novos })) })
  await renderizar(funcionarios)
  return el
}

const porRotulo = <T extends Element>(rotulo: string) => document.querySelector<T>(`[aria-label="${rotulo}"]`)!
const campo = (rotulo: string, nome: string) => porRotulo<HTMLInputElement>(`${rotulo} de ${nome}`)
const seta = (nome: string) => porRotulo<HTMLButtonElement>(`Ver detalhes de ${nome}`)
const situacao = (nome: string, valor: 'Ativo' | 'Inativo') =>
  [...document.querySelectorAll<HTMLButtonElement>(`[role="group"][aria-label="Situação de ${nome}"] button`)].find(b => b.textContent === valor)!
const salvar = (nome: string) => porRotulo<HTMLButtonElement>(`Salvar ${nome}`)
const texto = () => document.body.textContent ?? ''

async function clicar(el: Element) {
  const { act } = await import('react')
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}
async function digitar(el: HTMLInputElement, valor: string) {
  const { act } = await import('react')
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(el, valor)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

test('só quem está inativo ganha o selo "Inativo" (texto, não só cor)', async () => {
  await montar()
  const linhas = [...document.querySelectorAll('[role="row"]')]
  const doGil = linhas.find(l => l.textContent?.includes('Vendedor G'))!
  const daAna = linhas.find(l => l.textContent?.includes('Vendedor A'))!
  // Selo é <span>; os botões Ativo/Inativo do detalhe são <button> e não contam.
  const selos = (linha: Element) => [...linha.querySelectorAll('span')].filter(s => s.textContent === 'Inativo')
  assert.ok(selos(doGil).length > 0)
  assert.equal(selos(daAna).length, 0)
})

test('a seta abre e fecha o detalhe da pessoa, e só dela', async () => {
  await montar()
  assert.equal(seta('Vendedor A').getAttribute('aria-expanded'), 'false')
  await clicar(seta('Vendedor A'))
  assert.equal(seta('Vendedor A').getAttribute('aria-expanded'), 'true')
  assert.equal(seta('Vendedor G').getAttribute('aria-expanded'), 'false')
  await clicar(seta('Vendedor A'))
  assert.equal(seta('Vendedor A').getAttribute('aria-expanded'), 'false')
})

test('os campos nascem com o valor da pessoa em formato BR, um campo por valor', async () => {
  await montar()
  assert.equal(document.querySelectorAll('input[aria-label^="Salário de"]').length, 2)
  assert.equal(campo('Salário', 'Vendedor A').value, '2.450,00')
  assert.equal(campo('Ajuda de custo', 'Vendedor A').value, '300,00')
  assert.equal(campo('Adiantamento fixo', 'Vendedor A').value, '800,00')
  assert.equal(campo('Ajuda de custo', 'Vendedor G').value, '')
})

test('as regras aparecem só para leitura, com o caminho para mudá-las', async () => {
  await montar()
  assert.match(texto(), /1,0%\s+motos vendidas por ele\s+·\s+comissão/)
  assert.match(texto(), /0,05%\s+motos da loja\s+·\s+premiação/)
  assert.match(texto(), /sem regra/)
  assert.match(texto(), /Para mudar, use a aba Comissões/)
  assert.equal(document.querySelectorAll('[role="row"] input[aria-label*="gra"]').length, 0)
})

test('Ativo e Inativo mostram a situação e trocam o mesmo estado do checkbox', async () => {
  await montar()
  assert.equal(situacao('Vendedor A', 'Ativo').getAttribute('aria-pressed'), 'true')
  assert.equal(situacao('Vendedor A', 'Inativo').getAttribute('aria-pressed'), 'false')
  assert.equal(porRotulo<HTMLInputElement>('Vendedor A ativo').checked, true)
  await clicar(situacao('Vendedor A', 'Inativo'))
  assert.equal(situacao('Vendedor A', 'Inativo').getAttribute('aria-pressed'), 'true')
  assert.equal(porRotulo<HTMLInputElement>('Vendedor A ativo').checked, false)
  await clicar(porRotulo('Vendedor A ativo'))
  assert.equal(situacao('Vendedor A', 'Ativo').getAttribute('aria-pressed'), 'true')
})

test('Salvar manda à action o id e os quatro campos, com os números lidos', async () => {
  await montar()
  await digitar(campo('Salário', 'Vendedor A'), '2.600,50')
  await digitar(campo('Ajuda de custo', 'Vendedor A'), '')
  await clicar(situacao('Vendedor A', 'Inativo'))
  await clicar(salvar('Vendedor A'))
  assert.deepEqual(salvas, [['a', { salario: 2600.5, ajudaCusto: null, adiantamentoFixo: 800, ativo: false }]])
})

test('depois de salvar, o campo mostra o valor renormalizado e avisa a pessoa', async () => {
  await montar()
  await digitar(campo('Salário', 'Vendedor A'), '1880.5')
  await clicar(salvar('Vendedor A'))
  assert.equal(campo('Salário', 'Vendedor A').value, '1.880,50')
  assert.deepEqual(sucessos, ['Configuração de Vendedor A salva'])
})

test('valor inválido não chega à action e diz qual campo errou', async () => {
  await montar()
  await digitar(campo('Salário', 'Vendedor A'), 'abc')
  await clicar(salvar('Vendedor A'))
  await digitar(campo('Salário', 'Vendedor A'), '2.450,00')
  await digitar(campo('Ajuda de custo', 'Vendedor A'), 'abc')
  await clicar(salvar('Vendedor A'))
  await digitar(campo('Ajuda de custo', 'Vendedor A'), '300,00')
  await digitar(campo('Adiantamento fixo', 'Vendedor A'), 'abc')
  await clicar(salvar('Vendedor A'))
  assert.deepEqual(erros, ['Salário inválido', 'Ajuda de custo inválida', 'Adiantamento inválido'])
  assert.equal(salvas.length, 0)
})

test('erro da action vira aviso com a mensagem dela', async () => {
  await montar()
  falhaDaAcao = new Error('Sem permissão para salvar')
  await clicar(salvar('Vendedor A'))
  assert.deepEqual(erros, ['Sem permissão para salvar'])
  assert.equal(sucessos.length, 0)
})

test('depois do revalidatePath, o detalhe aberto e o que foi digitado continuam', async () => {
  await montar()
  await clicar(seta('Vendedor A'))
  await digitar(campo('Salário', 'Vendedor A'), '2.700,00')
  await renderizar([{ ...ana }, { ...gil }])
  assert.equal(seta('Vendedor A').getAttribute('aria-expanded'), 'true')
  assert.equal(campo('Salário', 'Vendedor A').value, '2.700,00')
})

test('sem funcionários, diz que não há ninguém nas lojas do grupo', async () => {
  await montar([])
  assert.match(texto(), /Nenhum funcionário encontrado nas lojas do grupo/)
})

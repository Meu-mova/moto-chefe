// Tabela da Folha do Mês (#628). jsdom não executa container query: quais colunas aparecem em
// cada largura é CSS e fica para o navegador; aqui vão o conteúdo, a abertura do detalhe e o campo.
import { JSDOM } from 'jsdom'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { LinhaFolhaDados } from './folha-mes-linha'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
const g = globalThis as Record<string, unknown>
g.window = dom.window; g.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'NodeList', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  g[k] = (dom.window as unknown as Record<string, unknown>)[k]
}
g.IS_REACT_ACT_ENVIRONMENT = true

const acaoMock = mock.module('../actions', { namedExports: { salvarValorRealAction: async () => {} } })
const toastMock = mock.module('sonner', { namedExports: { toast: { error: () => {} } } })
after(() => { acaoMock.restore(); toastMock.restore() })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
})

const regraCom = { id: 'r1', tipo: 'comissao', base: 'proprias_motos', percentual: 1, valorBase: 183040, valor: 1830.4, descricao: null }
const regraPrem = { id: 'r2', tipo: 'premiacao', base: 'loja_motos', percentual: 0.05, valorBase: 200000, valor: 100, descricao: null }
const vazia = { ativo: true, papel: 'vendedor', regras: [], premiacaoFaixa: 0, adiantamentoFixo: 0, adiantamentoEventual: 0 }
const ana = { ...vazia, id: 'a', nome: 'Vendedor A', papelLabel: 'Vendedor', lojaNome: 'Loja Centro', salario: 2450, comissao: 1830.4, premiacao: 600, premiacaoFaixa: 500,
  ajudaCusto: 300, adiantamento: 1000, adiantamentoFixo: 800, adiantamentoEventual: 200, totalPagar: 4180.4, valorReal: 4180.4, valorEfetivo: 4180.4, regras: [regraCom, regraPrem] }
const bia = { ...vazia, id: 'b', nome: 'Vendedor B Nascimento Albuquerque', papelLabel: 'Vendedor', lojaNome: 'Loja Norte', salario: 2450, comissao: 1215, premiacao: 0,
  ajudaCusto: 300, adiantamento: 800, totalPagar: 3165, valorReal: null, valorEfetivo: 3165 }
const caio = { ...vazia, id: 'c', nome: 'Mecânico D', papelLabel: 'Mecânico', lojaNome: 'Loja Centro', salario: 2300, comissao: 384, premiacao: 0,
  ajudaCusto: 0, adiantamento: 0, totalPagar: 2684, valorReal: 2700, valorEfetivo: 2700 }
const totais = { salarios: 7200, comissoes: 3429.4, premiacoes: 600, ajudaCusto: 600, adiantamentos: 1800, geral: 10029.4, efetivo: 10045.4, reaisInformados: 2 }

// Re-renderiza a mesma raiz com novos dados, como o Next faz depois do revalidatePath.
let renderizar: (ativos: LinhaFolhaDados[]) => Promise<void> = async () => {}

async function montar(ativos: LinhaFolhaDados[] = [ana, bia, caio]) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { FolhaMesTabela } = await import('./folha-mes-tabela')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const raiz = createRoot(el)
  raizes.push(raiz)
  renderizar = novos => act(async () => { raiz.render(React.createElement(FolhaMesTabela, { ativos: novos, totais, mes: '2026-10' })) })
  await renderizar(ativos)
  return el
}

const texto = () => document.body.textContent ?? ''
const setas = (nome: string) => [...document.querySelectorAll<HTMLButtonElement>(`button[aria-label="Ver detalhes de ${nome}"]`)]
const seta = (nome: string) => setas(nome)[0]!
const estado = (nome: string, valor: string) => setas(nome).length > 0 && setas(nome).every(b => b.getAttribute('aria-expanded') === valor)
const aberta = (nome: string) => estado(nome, 'true')
const fechada = (nome: string) => estado(nome, 'false')
async function clicar(el: Element) {
  const { act } = await import('react')
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

test('uma linha por pessoa, com o total do mês embaixo', async () => {
  await montar()
  assert.equal(document.querySelectorAll('[role="row"]').length, 1 + 3 + 1)
  assert.match(texto(), /Total \(3\)/)
  assert.match(texto(), /R\$ 10\.029,40/)
})

test('valor vazio nunca vira travessão: zero é R$ 0,00 esmaecido', async () => {
  await montar()
  assert.doesNotMatch(texto(), /—/)
  const zeros = [...document.querySelectorAll('span')].filter(s => s.textContent === 'R$ 0,00')
  assert.ok(zeros.length > 0)
  for (const z of zeros) assert.match(z.className, /text-muted-foreground/)
})

test('a situação do valor real aparece na linha: confere, sem valor, diferença', async () => {
  await montar()
  assert.match(texto(), /Real confere/)
  assert.match(texto(), /Sem valor real/)
  assert.match(texto(), /Real \+R\$ 16,00/)
})

test('um campo de valor real por pessoa, e não um por largura (fechado e com o detalhe aberto)', async () => {
  await montar()
  const campos = () => document.querySelectorAll('input[aria-label^="Valor real pago de"]').length
  assert.equal(campos(), 3)
  await clicar(seta('Vendedor A'))
  assert.equal(campos(), 3)
})

test('a seta abre o detalhe só da linha dela e fecha no segundo clique', async () => {
  await montar()
  assert.ok(fechada('Vendedor A'))
  assert.doesNotMatch(texto(), /Faixa OTE atingida/)
  await clicar(seta('Vendedor A'))
  assert.ok(aberta('Vendedor A'))
  assert.ok(fechada('Mecânico D'))
  assert.match(texto(), /Faixa OTE atingida/)
  await clicar(seta('Vendedor A'))
  assert.doesNotMatch(texto(), /Faixa OTE atingida/)
})

test('detalhe: cada regra, a faixa OTE e o fixo mais o eventual escritos', async () => {
  await montar()
  await clicar(seta('Vendedor A'))
  assert.match(texto(), /1% motos vendidas por ele · R\$ 183\.040,00/)
  assert.match(texto(), /0,05% motos da loja · R\$ 200\.000,00/)
  assert.match(texto(), /Faixa OTE atingida\s*R\$ 500,00/)
  assert.match(texto(), /Fixo\s*R\$ 800,00/)
  assert.match(texto(), /Eventual\s*R\$ 200,00/)
})

test('detalhe de quem não tem regra, premiação nem adiantamento diz isso em palavras', async () => {
  await montar()
  await clicar(seta('Mecânico D'))
  assert.match(texto(), /Sem regra de comissão neste mês/)
  assert.match(texto(), /Sem premiação neste mês/)
  assert.match(texto(), /Sem adiantamento neste mês/)
  assert.match(texto(), /Sem ajuda de custo neste mês/)
})

test('sem funcionário ativo, a tabela avisa em vez de ficar vazia', async () => {
  await montar([])
  assert.match(texto(), /Nenhum funcionário ativo configurado/)
})

test('salvar o valor real (nova leitura da página) mantém o detalhe aberto e o mesmo campo', async () => {
  await montar()
  await clicar(seta('Vendedor A'))
  const campo = document.querySelector('input[aria-label="Valor real pago de Vendedor A"]')
  await renderizar([{ ...ana, valorReal: 4200 }, bia, caio])
  assert.ok(aberta('Vendedor A'))
  assert.match(texto(), /Faixa OTE atingida/)
  assert.equal(document.querySelector('input[aria-label="Valor real pago de Vendedor A"]'), campo)
  assert.match(texto(), /Real \+R\$\u00a019,60/)
})

// Sem CSS no jsdom, a posição de cada controle é lida pela classe que o esconde por faixa.
test('a ordem do Tab é a ordem visual: celular seta → campo; tablet e desktop campo → seta', async () => {
  await montar()
  await clicar(seta('Vendedor A'))
  const linha = [...document.querySelectorAll('[role="row"]')].find(r => r.textContent?.includes('Vendedor A'))!
  const foco = [...linha.querySelectorAll('button, input')].map(el => {
    if (el.tagName === 'INPUT') return 'campo'
    return /@\[680px\]\/folha:hidden/.test(el.closest('[role="cell"]')!.className) ? 'seta-celular' : 'seta-tablet'
  })
  assert.deepEqual(foco, ['seta-celular', 'campo', 'seta-tablet'])
})

test('a seta só aponta para o detalhe (aria-controls) quando ele existe', async () => {
  await montar()
  assert.ok(setas('Vendedor A').every(b => !b.hasAttribute('aria-controls')))
  await clicar(seta('Vendedor A'))
  for (const b of setas('Vendedor A')) {
    const alvo = document.getElementById(b.getAttribute('aria-controls') ?? '')
    assert.ok(alvo, 'o aria-controls aponta para um elemento que existe')
    assert.match(alvo.textContent ?? '', /Faixa OTE atingida/)
  }
})

test('a tabela só tem linhas como filhos, inclusive a mensagem de lista vazia', async () => {
  await montar([])
  const tabela = document.querySelector('[role="table"]')!
  assert.ok(tabela.children.length > 0)
  for (const filho of tabela.children) assert.equal(filho.getAttribute('role'), 'row')
  assert.match(tabela.textContent ?? '', /Nenhum funcionário ativo configurado/)
})

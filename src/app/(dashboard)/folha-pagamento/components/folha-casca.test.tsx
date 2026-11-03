// Casca da folha (#628): cabeçalho único, seletor Seção, aviso por aba e Imprimir só na Folha do Mês.
// jsdom não executa container query: quais controles aparecem em cada largura é CSS e fica para o navegador.
import { JSDOM } from 'jsdom'
import test, { afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
const g = globalThis as Record<string, unknown>
g.window = dom.window; g.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'HTMLButtonElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'NodeList', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  g[k] = (dom.window as unknown as Record<string, unknown>)[k]
}
g.IS_REACT_ACT_ENVIRONMENT = true

// Fronteira de fora: a navegação do Next. O que o teste olha é para onde a tela manda ir.
const destinos: string[] = []
let busca = ''
mock.module('next/navigation', { namedExports: {
  useRouter: () => ({ push: (url: string) => { destinos.push(url) } }),
  usePathname: () => '/folha-pagamento',
  useSearchParams: () => new URLSearchParams(busca),
} })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  destinos.length = 0
  busca = ''
})

const lojas = [{ id: 'L1', nome: 'Loja Centro' }, { id: 'L2', nome: 'Loja Norte' }]

async function montar(lojaAtual = '', mesAtual = '2026-10') {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { TabsContent } = await import('@/components/ui/tabs')
  const { FolhaCasca } = await import('./folha-casca')
  const { ABAS_FOLHA } = await import('@/lib/folha-tela')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const raiz = createRoot(el)
  raizes.push(raiz)
  await act(async () => {
    raiz.render(React.createElement(FolhaCasca, {
      lojas, lojaAtual, mesAtual,
      children: ABAS_FOLHA.map(a => React.createElement(TabsContent, { key: a.id, value: a.id }, `conteudo ${a.id}`)),
    }))
  })
  return el
}

const botao = (nome: string) => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === nome || b.textContent?.trim() === nome)

async function clicar(el: Element | undefined) {
  const { act } = await import('react')
  await act(async () => { el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

// Troca o valor de um <select> nativo como o navegador faz, para o onChange do React disparar.
async function escolherNoSelect(rotulo: string, valor: string) {
  const { act } = await import('react')
  const select = document.querySelector<HTMLSelectElement>(`select[aria-label="${rotulo}"]`)
  assert.ok(select, `select "${rotulo}" não encontrado`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!.call(select, valor)
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}
const escolherSecao = (id: string) => escolherNoSelect('Seção', id)

test('cabeçalho mostra o mês por extenso e o seletor Seção lista as 7 abas', async () => {
  await montar()
  assert.match(document.body.textContent ?? '', /outubro de 2026/)
  const opcoes = [...document.querySelectorAll('select[aria-label="Seção"] option')].map(o => o.textContent)
  assert.deepEqual(opcoes, ['Folha do Mês', 'Funcionários', 'Comissões', 'Premiação (OTE)', 'Adiantamentos', 'Holerites', 'Ajustes'])
})

test('mês seguinte e anterior mantêm a loja escolhida na URL', async () => {
  busca = 'loja=L1&mes=2026-10'
  await montar('L1')
  await clicar(botao('Mês seguinte'))
  await clicar(botao('Mês anterior'))
  assert.deepEqual(destinos, ['/folha-pagamento?loja=L1&mes=2026-11', '/folha-pagamento?loja=L1&mes=2026-09'])
})

test('trocar a loja mantém o mês da URL', async () => {
  busca = 'mes=2026-10'
  await montar('', '2026-10')
  await escolherNoSelect('Loja', 'L2')
  assert.deepEqual(destinos, ['/folha-pagamento?mes=2026-10&loja=L2'])
})

test('Imprimir aparece só na Folha do Mês e leva o mês e a loja', async () => {
  const abertas: string[] = []
  g.open = (url: string) => { abertas.push(url) }
  ;(window as unknown as { open: unknown }).open = g.open
  await montar('L1')
  assert.ok(botao('Imprimir folha'))
  await clicar(botao('Imprimir folha'))
  assert.deepEqual(abertas, ['/folha-pagamento/imprimir?mes=2026-10&loja=L1'])
  await escolherSecao('funcionarios')
  assert.equal(botao('Imprimir folha'), undefined)
})

test('aviso aparece nas abas que ignoram um filtro e some na Folha do Mês e em Holerites', async () => {
  await montar()
  assert.doesNotMatch(document.body.textContent ?? '', /não muda esta aba/)
  await escolherSecao('adiantamentos')
  assert.match(document.body.textContent ?? '', /o filtro de loja não muda esta aba\. Segue o mês escolhido/)
  await escolherSecao('holerites')
  assert.doesNotMatch(document.body.textContent ?? '', /não muda esta aba/)
})

test('escolher a seção mostra o painel dela', async () => {
  await montar()
  assert.match(document.body.textContent ?? '', /conteudo mes/)
  await escolherSecao('ajustes')
  assert.match(document.body.textContent ?? '', /conteudo ajustes/)
  assert.doesNotMatch(document.body.textContent ?? '', /conteudo mes/)
})

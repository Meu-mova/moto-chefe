// Aba Holerites (#629): a situação primeiro, o filtro "Só o que falta" e as ações de cada envio.
// jsdom não executa container query: o que aparece em cada largura é CSS e fica para o navegador.
import { JSDOM } from 'jsdom'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
const g = globalThis as Record<string, unknown>
g.window = dom.window; g.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'File', 'FormData', 'NodeList', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  g[k] = (dom.window as unknown as Record<string, unknown>)[k]
}
g.IS_REACT_ACT_ENVIRONMENT = true

// Fronteiras de fora: as Server Actions (o servidor não muda neste ticket) e o toast.
type Chamada = [string, ...unknown[]]
const chamadas: Chamada[] = []
const toasts: string[] = []
let envioPendente: Promise<void> = Promise.resolve()
const actionsMock = mock.module('../holerites-actions', { namedExports: {
  uploadHoleriteAction: async (dados: FormData) => {
    chamadas.push(['upload', dados.get('usuarioId'), dados.get('mes'), dados.get('tipo'), (dados.get('file') as File).name])
    await envioPendente
    return { valorPreenchido: null, leituraFalhou: false, avisos: [] }
  },
  removerHoleriteAction: async (id: string) => { chamadas.push(['remover', id]) },
  getHoleriteUrlAction: async (id: string) => { chamadas.push(['url', id]); return 'https://arquivo.exemplo/x.pdf' },
} })
const toastMock = mock.module('sonner', { namedExports: { toast: Object.assign(() => {}, {
  success: (m: string) => { toasts.push(m) }, warning: (m: string) => { toasts.push(m) }, error: (m: string) => { toasts.push(m) },
}) } })
after(() => { actionsMock.restore(); toastMock.restore() })

const abrirOriginal = window.open
const confirmOriginal = window.confirm
const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  chamadas.length = 0; toasts.length = 0
  envioPendente = Promise.resolve()
  window.open = abrirOriginal; window.confirm = confirmOriginal
})

const pessoas = [
  { id: 'a', nome: 'Vendedor A', papel: 'vendedor', lojaNome: 'Loja Centro' },
  { id: 'b', nome: 'Vendedor B', papel: 'vendedor', lojaNome: 'Loja Norte' },
  { id: 'c', nome: 'Auxiliar C', papel: 'aux_adm', lojaNome: 'Loja Centro' },
]
const holerite = (usuarioId: string, tipo: string, extra: object = {}) => ({
  id: `h-${usuarioId}-${tipo}`, usuarioId, mes: '2026-10', tipo, arquivoNome: `${usuarioId}-${tipo}-secreto.pdf`,
  tamanho: 83 * 1024, enviadoEm: new Date('2026-10-05T15:00:00Z'), enviadoPorNome: 'Quem Enviou', ...extra,
})
// a: completo; b: só adiantamento; c: nada.
const base = [holerite('a', 'adiantamento'), holerite('a', 'salario'), holerite('b', 'adiantamento')]

let renderizar: (h: ReturnType<typeof holerite>[], f?: typeof pessoas) => Promise<void> = async () => {}
async function montar(holerites = base, funcionarios = pessoas) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { HoleritesTable } = await import('./holerites-table')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const raiz = createRoot(el)
  raizes.push(raiz)
  // Re-renderiza a mesma raiz com outras props, como o Next faz depois do revalidatePath.
  renderizar = (h, f = funcionarios) => act(async () => {
    raiz.render(React.createElement(HoleritesTable, { funcionarios: f, holerites: h, mes: '2026-10' }))
  })
  await renderizar(holerites)
  return el
}

const texto = () => document.body.textContent ?? ''
const botao = (nome: string) => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === nome || b.textContent?.replace(/\s+/g, ' ').trim() === nome)
const linhas = () => [...document.querySelectorAll('[role=row]')].filter(r => r.querySelector('[data-nome]'))
const nomes = () => linhas().map(l => l.querySelector('[data-nome]')!.textContent)

async function clicar(el: Element | undefined) {
  const { act } = await import('react')
  assert.ok(el, 'elemento não encontrado')
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

async function escolherArquivo(nome = 'novo.pdf') {
  const { act } = await import('react')
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!
  const arquivo = new window.File(['%PDF'], nome, { type: 'application/pdf' })
  Object.defineProperty(input, 'files', { value: [arquivo], configurable: true })
  await act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })) })
}

test('o topo mostra "N de M enviados", a barra e a conta por tipo', async () => {
  await montar()
  assert.match(texto(), /3 de 6 enviados/)
  const barra = document.querySelector('[role=progressbar]')!
  assert.equal(barra.getAttribute('aria-valuenow'), '3')
  assert.equal(barra.getAttribute('aria-valuemax'), '6')
  assert.match(texto(), /Adiantamento: 2 de 3/)
  assert.match(texto(), /Pagamento do salário: 1 de 3/)
})

test('holerite de quem saiu não entra na conta do topo', async () => {
  await montar([...base, holerite('saiu', 'salario'), holerite('saiu', 'adiantamento')])
  assert.match(texto(), /3 de 6 enviados/)
})

test('"Só o que falta" mostra a contagem e esconde quem já enviou tudo; clicar de novo volta', async () => {
  await montar()
  assert.deepEqual(nomes(), ['Vendedor A', 'Vendedor B', 'Auxiliar C'])
  const filtro = botao('Só o que falta 2')
  assert.equal(filtro?.getAttribute('aria-pressed'), 'false')
  await clicar(filtro)
  assert.equal(filtro?.getAttribute('aria-pressed'), 'true')
  assert.deepEqual(nomes(), ['Vendedor B', 'Auxiliar C'])
  await clicar(filtro)
  assert.deepEqual(nomes(), ['Vendedor A', 'Vendedor B', 'Auxiliar C'])
})

test('com o filtro ligado, quem completa o último envio some na hora', async () => {
  await montar()
  await clicar(botao('Só o que falta 2'))
  assert.ok(nomes().includes('Vendedor B'))
  await renderizar([...base, holerite('b', 'salario')])
  assert.deepEqual(nomes(), ['Auxiliar C'])
  assert.equal(botao('Só o que falta 1')?.getAttribute('aria-pressed'), 'true')
})

test('com o filtro ligado e ninguém pendente, avisa em vez de mostrar tabela vazia', async () => {
  await montar()
  await clicar(botao('Só o que falta 2'))
  await renderizar([...base, holerite('b', 'salario'), holerite('c', 'adiantamento'), holerite('c', 'salario')])
  assert.deepEqual(nomes(), [])
  assert.match(texto(), /Ninguém com envio pendente/)
})

test('cada envio é uma etiqueta com texto: "Enviado DD/MM" ou "Falta enviar"; o arquivo não aparece na linha', async () => {
  await montar()
  const a = linhas()[0].textContent ?? ''
  assert.match(a, /Enviado 05\/10/)
  assert.doesNotMatch(a, /Falta enviar/)
  assert.match(linhas()[1].textContent ?? '', /Enviado 05\/10.*Falta enviar/)
  assert.doesNotMatch(texto(), /secreto\.pdf/)
})

test('o detalhe mostra quem enviou e o tamanho', async () => {
  await montar()
  assert.doesNotMatch(texto(), /Quem Enviou/)
  await clicar(botao('Ver detalhes de Vendedor B'))
  assert.match(texto(), /Enviado em 05\/10\/2026 por Quem Enviou, 83 KB\./)
  assert.match(texto(), /O PDF deste mês ainda não foi enviado\./)
})

test('com envio: Abrir, Substituir e Remover; sem envio: só Enviar PDF', async () => {
  await montar()
  assert.ok(botao('Abrir'), 'Abrir')
  assert.ok(botao('Substituir'), 'Substituir')
  assert.ok(botao('Remover holerite de adiantamento de Vendedor A'))
  assert.equal(botao('Remover holerite de pagamento do salário de Vendedor B'), undefined)
  assert.ok(botao('Enviar PDF'))
})

test('Enviar PDF manda pessoa, mês, tipo e arquivo certos, e avisa o sucesso', async () => {
  await montar([], [pessoas[2]])
  await clicar([...document.querySelectorAll('button')].filter(b => b.textContent?.includes('Enviar PDF'))[1])
  await escolherArquivo('folha.pdf')
  assert.deepEqual(chamadas, [['upload', 'c', '2026-10', 'salario', 'folha.pdf']])
  assert.deepEqual(toasts, ['Holerite enviado'])
})

test('Substituir reenvia no mesmo tipo e diz "substituído"', async () => {
  await montar([holerite('a', 'salario')], [pessoas[0]])
  await clicar(botao('Substituir'))
  await escolherArquivo()
  assert.deepEqual(chamadas, [['upload', 'a', '2026-10', 'salario', 'novo.pdf']])
  assert.deepEqual(toasts, ['Holerite substituído'])
})

test('os botões do envio ficam desabilitados enquanto ele não termina', async () => {
  let liberar!: () => void
  envioPendente = new Promise<void>(r => { liberar = r })
  await montar([], [pessoas[0]])
  await clicar(botao('Enviar PDF'))
  await escolherArquivo()
  const enviar = [...document.querySelectorAll('button')].filter(b => b.textContent?.includes('Enviando'))
  assert.ok(enviar.length > 0 && enviar.every(b => b.hasAttribute('disabled')))
  const { act } = await import('react')
  await act(async () => { liberar() })
  assert.ok(![...document.querySelectorAll('button')].some(b => b.textContent?.includes('Enviando')))
})

test('Abrir abre a janela ANTES de pedir o link, com o id da linha', async () => {
  const aba = { location: { href: '' } }
  window.open = (() => { chamadas.push(['janela']); return aba }) as unknown as typeof window.open
  await montar([holerite('a', 'salario')], [pessoas[0]])
  await clicar(botao('Abrir'))
  assert.deepEqual(chamadas, [['janela'], ['url', 'h-a-salario']])
  assert.equal(aba.location.href, 'https://arquivo.exemplo/x.pdf')
})

test('Remover só chama o servidor se a pessoa confirmar', async () => {
  await montar([holerite('a', 'salario')], [pessoas[0]])
  window.confirm = () => false
  await clicar(botao('Remover holerite de pagamento do salário de Vendedor A'))
  assert.deepEqual(chamadas, [])
  window.confirm = () => true
  await clicar(botao('Remover holerite de pagamento do salário de Vendedor A'))
  assert.deepEqual(chamadas, [['remover', 'h-a-salario']])
  assert.deepEqual(toasts, ['Holerite removido'])
})

test('o rótulo do papel vem da lib', async () => {
  await montar()
  assert.match(texto(), /Aux\. Administrativo · Loja Centro/)
})

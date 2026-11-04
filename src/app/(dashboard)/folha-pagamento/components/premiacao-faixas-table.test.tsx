// Aba Premiação (#631): faixas, "Como funciona" e "Nova faixa". jsdom não executa container query:
// o que aparece em cada largura é CSS e fica para o navegador; aqui vão o conteúdo e o que vai à action.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar } from '@/test/eventos-dom'

const { desmontar } = montarDom()
after(desmontar)

// Fronteira de fora: as Server Actions e o toast. O teste olha o que a tela manda a elas.
const criadas: unknown[][] = []
const excluidas: string[] = []
const erros: string[] = []
const acoesMock = mock.module('../actions', { namedExports: {
  criarFaixaPremiacaoAction: async (...args: unknown[]) => { criadas.push(args) },
  excluirFaixaPremiacaoAction: async (id: string) => { excluidas.push(id) },
} })
const toastMock = mock.module('sonner', { namedExports: { toast: { error: (m: string) => { erros.push(m) }, success: () => {} } } })
after(() => { acoesMock.restore(); toastMock.restore() })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  criadas.length = 0
  excluidas.length = 0
  erros.length = 0
})

const FAIXAS = [
  { id: 'f3', valorMinimoVendas: '300000', premiacao: '1200' },
  { id: 'f1', valorMinimoVendas: '150000', premiacao: '500' },
  { id: 'f2', valorMinimoVendas: '200000', premiacao: '800' },
]

async function montar(faixas = FAIXAS) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { PremiacaoFaixasTable } = await import('./premiacao-faixas-table')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const raiz = createRoot(el)
  raizes.push(raiz)
  await act(async () => { raiz.render(React.createElement(PremiacaoFaixasTable, { faixas })) })
  return el
}

// fmtBRL separa "R$" do número com espaço sem quebra.
const limpo = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ')
const texto = (el: Element | null | undefined) => limpo(el?.textContent)
const linhas = () => [...document.querySelectorAll('tbody tr')].map(texto)
const botao = (nome: string) => [...document.querySelectorAll('button')].find(b => limpo(b.getAttribute('aria-label')) === nome || texto(b).trim() === nome)
const campos = () => [...document.querySelectorAll<HTMLInputElement>('input')]

test('as faixas aparecem por venda mínima, com a posição (1ª, 2ª, 3ª) e os valores em reais', async () => {
  await montar()
  const [primeira, segunda, terceira] = linhas()
  assert.match(primeira, /1ª.*R\$ 150\.000,00.*R\$ 500,00/)
  assert.match(segunda, /2ª.*R\$ 200\.000,00.*R\$ 800,00/)
  assert.match(terceira, /3ª.*R\$ 300\.000,00.*R\$ 1\.200,00/)
})

test('"Como funciona" traz o aviso de filtros, a regra e um exemplo calculado das faixas', async () => {
  await montar()
  const cartao = [...document.querySelectorAll('section')].find(s => /Como funciona/.test(texto(s)))
  assert.ok(cartao, 'cartão "Como funciona" não encontrado')
  assert.match(texto(cartao), /os filtros de loja e de mês não mudam esta aba/)
  assert.match(texto(cartao), /Valor fixo.*só para vendedor.*motos que a própria pessoa vendeu/)
  assert.match(texto(cartao), /soma.*regras de premiação em percentual.*Comissões/)
  assert.match(texto(cartao), /Exemplo: vendeu R\$ 230\.000,00 no mês, ganha R\$ 800,00 \(2ª faixa\)/)
})

test('sem faixa cadastrada: mensagem na tabela e nenhum exemplo', async () => {
  await montar([])
  assert.match(texto(document.body), /Nenhuma faixa cadastrada\./)
  assert.doesNotMatch(texto(document.body), /Exemplo:/)
})

test('a ordem do documento é Como funciona, tabela, Nova faixa (a mesma do celular e do tablet)', async () => {
  await montar()
  const como = [...document.querySelectorAll('section')].find(s => /Como funciona/.test(texto(s)))
  const tabela = document.querySelector('table')
  const nova = [...document.querySelectorAll('section')].find(s => /Nova faixa/.test(texto(s)))
  assert.ok(como && tabela && nova, 'cartões e tabela presentes')
  const antes = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & window.Node.DOCUMENT_POSITION_FOLLOWING)
  assert.ok(antes(como, tabela), 'Como funciona antes da tabela')
  assert.ok(antes(tabela, nova), 'tabela antes de Nova faixa')
})

test('faixa nova manda venda mínima e premiação lidas em número, e os campos esvaziam', async () => {
  await montar()
  const [minimo, premio] = campos()
  await digitar(minimo, '150.000,00')
  await digitar(premio, '500,00')
  await clicar(botao('Adicionar faixa'))
  assert.deepEqual(criadas, [[150000, 500]])
  assert.deepEqual(campos().map(c => c.value), ['', ''])
})

test('campo vazio ou inválido avisa e não chama a action', async () => {
  await montar()
  await clicar(botao('Adicionar faixa'))
  const [minimo, premio] = campos()
  await digitar(minimo, 'abc')
  await digitar(premio, '500')
  await clicar(botao('Adicionar faixa'))
  await digitar(minimo, '150000')
  await digitar(premio, 'xyz')
  await clicar(botao('Adicionar faixa'))
  assert.deepEqual(erros, ['Preencha os dois campos', 'Venda mínima inválida', 'Premiação inválida'])
  assert.deepEqual(criadas, [])
})

test('a lixeira se chama pelo valor da faixa (não pela posição, que muda ao excluir) e remove a faixa certa', async () => {
  await montar()
  await clicar(botao('Remover faixa de R$ 200.000,00'))
  assert.deepEqual(excluidas, ['f2'])
})

test('só adiciona e remove: não há controle para editar uma faixa', async () => {
  await montar()
  const nomes = [...document.querySelectorAll('button')].map(b => limpo(b.getAttribute('aria-label') ?? b.textContent).trim())
  assert.deepEqual(nomes, ['Remover faixa de R$ 150.000,00', 'Remover faixa de R$ 200.000,00', 'Remover faixa de R$ 300.000,00', 'Adicionar faixa'])
})

// Casca da folha (#628): cabeçalho único, seletor Seção, aviso por aba e Imprimir só na Folha do Mês.
// jsdom não executa container query: quais controles aparecem em cada largura é CSS e fica para o navegador.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, escolher } from '@/test/eventos-dom'

const { dom, desmontar } = montarDom()
after(desmontar)

// Fronteira de fora: a navegação do Next. O que o teste olha é para onde a tela manda ir.
const destinos: string[] = []
let busca = ''
// Quanto a navegação demora: o push devolve esta promessa, e a tela fica "navegando" até ela resolver.
let navegacao: Promise<void> = Promise.resolve()
const navegacaoMock = mock.module('next/navigation', { namedExports: {
  useRouter: () => ({ push: (url: string) => { destinos.push(url); return navegacao } }),
  usePathname: () => '/folha-pagamento',
  useSearchParams: () => new URLSearchParams(busca),
} })

after(() => navegacaoMock.restore())

const abrirOriginal = window.open
const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  destinos.length = 0
  busca = ''
  navegacao = Promise.resolve()
  window.open = abrirOriginal
})

const lojas = [{ id: 'L1', nome: 'Loja Centro' }, { id: 'L2', nome: 'Loja Norte' }]

// Re-renderiza a mesma raiz com outros filtros, como o Next faz depois de um router.push.
let renderizar: (lojaAtual: string, mesAtual: string) => Promise<void> = async () => {}

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
  renderizar = (loja, mes) => act(async () => {
    raiz.render(React.createElement(FolhaCasca, {
      lojas, lojaAtual: loja, mesAtual: mes,
      children: ABAS_FOLHA.map(a => React.createElement(TabsContent, { key: a.id, value: a.id }, `conteudo ${a.id}`)),
    }))
  })
  await renderizar(lojaAtual, mesAtual)
  return el
}

const botao = (nome: string) => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === nome || b.textContent?.trim() === nome)

// Troca o valor de um <select> nativo pelo rótulo dele.
async function escolherNoSelect(rotulo: string, valor: string) {
  const select = document.querySelector<HTMLSelectElement>(`select[aria-label="${rotulo}"]`)
  assert.ok(select, `select "${rotulo}" não encontrado`)
  await escolher(select, valor)
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
  window.open = ((url: string) => { abertas.push(url); return null }) as typeof window.open
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

test('Imprimir no celular mantém o alvo de toque de 44 px de largura, mesmo só com o ícone', async () => {
  await montar()
  // jsdom não calcula layout: o que dá para provar aqui é a classe que reserva a largura; a medida real é do navegador.
  assert.match(botao('Imprimir folha')?.className ?? '', /(^| )min-w-11( |$)/)
})

test('enquanto navega, os botões do mês travam e o segundo clique não navega de novo', async () => {
  const { act } = await import('react')
  let terminar = () => {}
  navegacao = new Promise<void>(resolve => { terminar = resolve })
  busca = 'loja=L1&mes=2026-10'
  await montar('L1')
  await clicar(botao('Mês seguinte'))
  assert.equal((botao('Mês seguinte') as HTMLButtonElement).disabled, true)
  assert.equal((botao('Mês anterior') as HTMLButtonElement).disabled, true)
  await clicar(botao('Mês seguinte'))
  assert.deepEqual(destinos, ['/folha-pagamento?loja=L1&mes=2026-11'])
  await act(async () => { terminar() })
  assert.equal((botao('Mês seguinte') as HTMLButtonElement).disabled, false)
})

test('a aba escolhida sobrevive a uma nova loja e a um novo mês', async () => {
  await montar('L1', '2026-10')
  await escolherSecao('ajustes')
  await renderizar('L2', '2026-11')
  assert.match(document.body.textContent ?? '', /conteudo ajustes/)
  assert.equal(document.querySelector<HTMLSelectElement>('select[aria-label="Seção"]')?.value, 'ajustes')
})

test('mês seguinte sem mes na URL parte do mês que a tela mostra', async () => {
  busca = ''
  await montar('', '2026-10')
  await clicar(botao('Mês seguinte'))
  assert.deepEqual(destinos, ['/folha-pagamento?mes=2026-11'])
})

test('o mês vira o ano: dezembro vai a janeiro e janeiro volta a dezembro', async () => {
  busca = 'mes=2026-12'
  await montar('', '2026-12')
  await clicar(botao('Mês seguinte'))
  busca = 'mes=2026-01'
  await renderizar('', '2026-01')
  await clicar(botao('Mês anterior'))
  assert.deepEqual(destinos, ['/folha-pagamento?mes=2027-01', '/folha-pagamento?mes=2025-12'])
})

test('clicar na aba troca o painel e o seletor Seção acompanha', async () => {
  await montar()
  await clicar(botao('Ajustes'))
  assert.match(document.body.textContent ?? '', /conteudo ajustes/)
  assert.doesNotMatch(document.body.textContent ?? '', /conteudo mes/)
  assert.equal(document.querySelector<HTMLSelectElement>('select[aria-label="Seção"]')?.value, 'ajustes')
})

test('cada aba que ignora um filtro mostra o aviso dela (a Premiação mostra o seu no cartão Como funciona)', async () => {
  await montar()
  const avisos: [string, RegExp][] = [
    ['funcionarios', /O mês não muda esta aba/],
    ['comissoes', /o mês só define quais estão vigentes/],
  ]
  for (const [id, aviso] of avisos) {
    await escolherSecao(id)
    assert.match(document.body.textContent ?? '', aviso, id)
  }
  await escolherSecao('premiacao')
  assert.doesNotMatch(document.body.textContent ?? '', /não mudam esta aba/, 'a casca não repete o aviso: ele mora no cartão Como funciona')
})

test('Imprimir com "Todas as lojas" leva loja vazia, que o servidor lê como todas', async () => {
  const abertas: string[] = []
  window.open = ((url: string) => { abertas.push(url); return null }) as typeof window.open
  await montar('', '2026-10')
  await clicar(botao('Imprimir folha'))
  assert.deepEqual(abertas, ['/folha-pagamento/imprimir?mes=2026-10&loja='])
})

// O botão Voltar do layout flutua à esquerda. Um elemento com container-type (BFC) não passa por
// baixo do float: vai para o lado dele e perde largura. Por isso o título fica FORA do container
// (texto contorna o float, como nas outras telas) e o container limpa o float e começa abaixo, na
// largura cheia. jsdom não mede layout: a largura real é conferida no navegador.
test('o título fica fora do container de largura e o container limpa o botão Voltar flutuante', async () => {
  await montar()
  const container = [...document.querySelectorAll('div')].find(d => d.className.includes('@container/folha'))
  assert.ok(container, 'container da folha não encontrado')
  assert.match(container.className, /\bclear-both\b/)
  const titulo = document.querySelector('h1')!
  assert.equal(titulo.textContent, 'Folha de Pagamento')
  assert.ok(!container.contains(titulo), 'o título não pode estar dentro do container')
  assert.ok(container.contains(document.querySelector('select[aria-label="Loja"]')), 'os controles ficam dentro do container')
})

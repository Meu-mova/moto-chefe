// Aba Ajustes (#631 B): lista com detalhe e formulário. jsdom não executa container query: quais
// colunas aparecem em cada largura é CSS e fica para o navegador.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar, escolher } from '@/test/eventos-dom'

const { desmontar } = montarDom()
after(desmontar)

const criados: unknown[] = []
const excluidos: string[] = []
const erros: string[] = []
const acoesMock = mock.module('../actions', { namedExports: {
  criarAjusteBaseAction: async (dados: unknown) => { criados.push(dados) },
  excluirAjusteBaseAction: async (id: string) => { excluidos.push(id) },
} })
const toastMock = mock.module('sonner', { namedExports: { toast: { error: (m: string) => { erros.push(m) }, success: () => {} } } })
after(() => { acoesMock.restore(); toastMock.restore() })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  criados.length = 0
  excluidos.length = 0
  erros.length = 0
})

const AJUSTES = [
  { id: 'j1', lojaId: 'L1', lojaNome: 'Loja Centro', tipo: 'pecas', usuarioId: 'u1', usuarioNome: 'Vendedor A', valor: '1250.00', observacao: 'Venda de capacete no balcão' },
  { id: 'j2', lojaId: 'L2', lojaNome: 'Loja Norte', tipo: 'servicos', usuarioId: null, usuarioNome: null, valor: '-150.00', observacao: null },
]
const LOJAS = [{ id: 'L1', nome: 'Loja Centro' }, { id: 'L2', nome: 'Loja Norte' }]
const FUNCIONARIOS = [{ id: 'u1', nome: 'Vendedor A', lojaId: 'L1' }, { id: 'u2', nome: 'Mecânico D', lojaId: 'L2' }]

async function montar(ajustes = AJUSTES) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { AjustesBaseTable } = await import('./ajustes-base-table')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const raiz = createRoot(el)
  raizes.push(raiz)
  await act(async () => { raiz.render(React.createElement(AjustesBaseTable, { ajustes, lojas: LOJAS, funcionarios: FUNCIONARIOS, mes: '2026-10' })) })
  return el
}

const limpo = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ')
const texto = (el: Element | null | undefined) => limpo(el?.textContent)
const linha = (loja: string) => [...document.querySelectorAll('[role="row"]')].find(r => texto(r).includes(loja) && !r.querySelector('[role="columnheader"]'))
const botao = (nome: string) => [...document.querySelectorAll('button')].find(b => limpo(b.getAttribute('aria-label')) === nome || texto(b).trim() === nome)
const seta = (nome: string) => botao(`Ver detalhes de ${nome}`)
const campo = (rotulo: string) => document.getElementById([...document.querySelectorAll('label')].find(l => texto(l).startsWith(rotulo))?.htmlFor ?? '')

test('a linha mostra loja, tipo, funcionário (ou "só a loja") e valor, com sinal quando negativo', async () => {
  await montar()
  const j1 = texto(linha('Loja Centro'))
  assert.match(j1, /Peças/)
  assert.match(j1, /Vendedor A/)
  assert.match(j1, /R\$ 1\.250,00/)
  const j2 = texto(linha('Loja Norte'))
  assert.match(j2, /Serviços \(mão de obra\)/)
  assert.match(j2, /só a loja/)
  assert.match(j2, /-R\$ 150,00/)
})

test('a seta abre o detalhe com o motivo e Remover; sem motivo diz "Sem motivo"', async () => {
  await montar()
  assert.equal(botao('Remover'), undefined)
  await clicar(seta('Loja Centro'))
  assert.equal(seta('Loja Centro')?.getAttribute('aria-expanded'), 'true')
  assert.match(texto(linha('Loja Centro')), /Motivo.*Venda de capacete no balcão/)
  assert.ok(botao('Remover'))
  await clicar(seta('Loja Norte'))
  assert.match(texto(linha('Loja Norte')), /Sem motivo/)
})

test('Remover do detalhe e a lixeira da tabela apagam o ajuste certo', async () => {
  await montar()
  await clicar(seta('Loja Centro'))
  await clicar(botao('Remover'))
  await clicar(botao('Remover ajuste de Loja Norte'))
  assert.deepEqual(excluidos, ['j1', 'j2'])
})

test('sem ajuste: mensagem na tabela', async () => {
  await montar([])
  assert.match(texto(document.body), /Nenhum ajuste neste mês\./)
})

test('Funcionário e o botão ficam desligados até escolher a loja, e a lista só tem gente daquela loja', async () => {
  await montar()
  const funcionario = campo('Funcionário') as HTMLSelectElement
  assert.equal(funcionario.disabled, true)
  assert.equal((botao('Lançar ajuste') as HTMLButtonElement).disabled, true)
  assert.match(texto(document.body), /Escolha a loja para liberar o funcionário e o botão\./)
  await escolher(campo('Loja') as HTMLSelectElement, 'L1')
  assert.equal(funcionario.disabled, false)
  assert.equal((botao('Lançar ajuste') as HTMLButtonElement).disabled, false)
  assert.deepEqual([...funcionario.options].map(o => o.textContent), ['Só a loja', 'Vendedor A'])
})

test('trocar a loja zera o funcionário escolhido', async () => {
  await montar()
  await escolher(campo('Loja') as HTMLSelectElement, 'L1')
  await escolher(campo('Funcionário') as HTMLSelectElement, 'u1')
  assert.equal((campo('Funcionário') as HTMLSelectElement).value, 'u1')
  await escolher(campo('Loja') as HTMLSelectElement, 'L2')
  assert.equal((campo('Funcionário') as HTMLSelectElement).value, '')
})

test('o formulário manda loja, mês, tipo, funcionário (ou nulo), valor em número e motivo, e esvazia o que muda a cada lançamento', async () => {
  await montar()
  await escolher(campo('Loja') as HTMLSelectElement, 'L1')
  await digitar(campo('Valor') as HTMLInputElement, '-50,25')
  await digitar(campo('Motivo') as HTMLInputElement, 'Corrige a maior')
  await clicar(botao('Lançar ajuste'))
  await escolher(campo('Funcionário') as HTMLSelectElement, 'u1')
  await escolher(campo('Tipo') as HTMLSelectElement, 'motos')
  await digitar(campo('Valor') as HTMLInputElement, '10')
  await clicar(botao('Lançar ajuste'))
  assert.deepEqual(criados, [
    { lojaId: 'L1', mes: '2026-10', tipo: 'pecas', usuarioId: null, valor: -50.25, observacao: 'Corrige a maior' },
    { lojaId: 'L1', mes: '2026-10', tipo: 'motos', usuarioId: 'u1', valor: 10, observacao: '' },
  ])
  assert.equal((campo('Valor') as HTMLInputElement).value, '')
})

test('valor inválido avisa e não chama a action', async () => {
  await montar()
  await escolher(campo('Loja') as HTMLSelectElement, 'L1')
  await digitar(campo('Valor') as HTMLInputElement, 'abc')
  await clicar(botao('Lançar ajuste'))
  assert.deepEqual(erros, ['Valor inválido'])
  assert.deepEqual(criados, [])
})

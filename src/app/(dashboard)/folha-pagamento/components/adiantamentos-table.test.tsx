// Aba Adiantamentos (#631 B): lista com detalhe, total do mês e formulário. jsdom não executa container
// query: quais colunas aparecem em cada largura é CSS e fica para o navegador; aqui vão o conteúdo,
// o detalhe, a trava do botão e o que vai à action.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar, escolher } from '@/test/eventos-dom'

const { desmontar } = montarDom()
after(desmontar)

// Fronteira de fora: as Server Actions e o toast. O teste olha o que a tela manda a elas.
const criados: unknown[] = []
const excluidos: string[] = []
const erros: string[] = []
const acoesMock = mock.module('../actions', { namedExports: {
  criarAdiantamentoAction: async (dados: unknown) => { criados.push(dados) },
  excluirAdiantamentoAction: async (id: string) => { excluidos.push(id) },
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

const ADIANTAMENTOS = [
  { id: 'a1', lojaId: 'L1', lojaNome: 'Loja Centro', usuarioId: 'u1', usuarioNome: 'Vendedor A', valor: '200.00', data: '2026-10-05', observacao: 'Vale do dia 05' },
  { id: 'a2', lojaId: 'L1', lojaNome: 'Loja Centro', usuarioId: 'u2', usuarioNome: 'Mecânico D', valor: '150.00', data: null, observacao: null },
  { id: 'a3', lojaId: 'L2', lojaNome: 'Loja Norte', usuarioId: 'u3', usuarioNome: null, valor: '150.00', data: '2026-10-20', observacao: null },
]
const FUNCIONARIOS = [{ id: 'u1', nome: 'Vendedor A', lojaId: 'L1' }, { id: 'u2', nome: 'Mecânico D', lojaId: 'L1' }]

let renderizar: (lista: typeof ADIANTAMENTOS) => Promise<void> = async () => {}

async function montar(adiantamentos = ADIANTAMENTOS) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { AdiantamentosTable } = await import('./adiantamentos-table')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const raiz = createRoot(el)
  raizes.push(raiz)
  renderizar = async lista => { await act(async () => { raiz.render(React.createElement(AdiantamentosTable, { adiantamentos: lista, funcionarios: FUNCIONARIOS, mes: '2026-10' })) }) }
  await renderizar(adiantamentos)
  return el
}

// fmtBRL separa "R$" do número com espaço sem quebra.
const limpo = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ')
const texto = (el: Element | null | undefined) => limpo(el?.textContent)
const linha = (nome: string) => [...document.querySelectorAll('[role="row"]')].find(r => texto(r).includes(nome))
const botao = (nome: string) => [...document.querySelectorAll('button')].find(b => limpo(b.getAttribute('aria-label')) === nome || texto(b).trim() === nome)
// O nome da seta e da lixeira leva data e valor (duas linhas da mesma pessoa não podem soar iguais).
const comPrefixo = (prefixo: string) => [...document.querySelectorAll('button')].find(b => limpo(b.getAttribute('aria-label')).startsWith(prefixo))
const seta = (nome: string) => comPrefixo(`Ver detalhes de ${nome}`)
const detalhe = (id: string) => document.getElementById(`detalhe-${id}`)
const removerDoDetalhe = (id: string) => detalhe(id)?.querySelector('button')
const campo = (rotulo: string) => document.getElementById([...document.querySelectorAll('label')].find(l => texto(l).startsWith(rotulo))?.htmlFor ?? '')

test('a linha mostra funcionário, loja, data DD/MM/AAAA (sem virar o dia pelo fuso) e valor em reais', async () => {
  await montar()
  const a1 = texto(linha('Vendedor A'))
  assert.match(a1, /Loja Centro/)
  assert.match(a1, /05\/10\/2026/)
  assert.match(a1, /R\$ 200,00/)
})

test('sem data ou sem nome a linha diz "Sem data" e "Sem nome", nunca um travessão', async () => {
  await montar()
  assert.match(texto(linha('Mecânico D')), /Sem data/)
  assert.match(texto(linha('Loja Norte')), /Sem nome/)
  assert.doesNotMatch(texto(document.body), /—/)
})

test('a seta abre o detalhe com a observação e Remover, e fecha de novo', async () => {
  await montar()
  assert.equal(seta('Vendedor A')?.getAttribute('aria-expanded'), 'false')
  assert.equal(detalhe('a1'), null)
  await clicar(seta('Vendedor A'))
  assert.equal(seta('Vendedor A')?.getAttribute('aria-expanded'), 'true')
  assert.match(texto(linha('Vendedor A')), /Observação.*Vale do dia 05/)
  assert.ok(removerDoDetalhe('a1'))
  await clicar(seta('Vendedor A'))
  assert.equal(detalhe('a1'), null)
})

test('sem observação o detalhe diz "Sem observação"', async () => {
  await montar()
  await clicar(seta('Mecânico D'))
  assert.match(texto(linha('Mecânico D')), /Sem observação/)
})

test('Remover do detalhe e a lixeira da tabela apagam o adiantamento certo', async () => {
  await montar()
  await clicar(seta('Vendedor A'))
  await clicar(removerDoDetalhe('a1'))
  await clicar(comPrefixo('Remover adiantamento de Mecânico D'))
  assert.deepEqual(excluidos, ['a1', 'a2'])
})

test('"Total do mês" soma os valores; sem lançamento: mensagem e nenhum total', async () => {
  await montar()
  assert.match(texto(linha('Total do mês')), /R\$ 500,00/)
  document.body.innerHTML = ''
  await montar([])
  assert.match(texto(document.body), /Nenhum adiantamento neste mês\./)
  assert.doesNotMatch(texto(document.body), /Total do mês/)
})

test('o botão fica desligado, com a dica, até escolher o funcionário', async () => {
  await montar()
  assert.equal((botao('Lançar adiantamento') as HTMLButtonElement).disabled, true)
  assert.match(texto(document.body), /Escolha o funcionário para liberar o botão\./)
  await escolher(campo('Funcionário') as HTMLSelectElement, 'u1')
  assert.equal((botao('Lançar adiantamento') as HTMLButtonElement).disabled, false)
  assert.doesNotMatch(texto(document.body), /Escolha o funcionário para liberar o botão\./)
})

test('o formulário manda funcionário, mês, valor lido em número, data e observação, e esvazia', async () => {
  await montar()
  await escolher(campo('Funcionário') as HTMLSelectElement, 'u1')
  await digitar(campo('Valor') as HTMLInputElement, '150,50')
  await digitar(campo('Data do adiantamento') as HTMLInputElement, '2026-10-05')
  await digitar(campo('Observação') as HTMLInputElement, 'Vale')
  await clicar(botao('Lançar adiantamento'))
  assert.deepEqual(criados, [{ usuarioId: 'u1', mes: '2026-10', valor: 150.5, data: '2026-10-05', observacao: 'Vale' }])
  assert.equal((campo('Funcionário') as HTMLSelectElement).value, '')
  assert.equal((campo('Valor') as HTMLInputElement).value, '')
})

test('sem data, o formulário manda data nula; valor inválido avisa e não chama a action', async () => {
  await montar()
  await escolher(campo('Funcionário') as HTMLSelectElement, 'u2')
  await digitar(campo('Valor') as HTMLInputElement, 'abc')
  await clicar(botao('Lançar adiantamento'))
  assert.deepEqual(erros, ['Valor inválido'])
  assert.deepEqual(criados, [])
  await digitar(campo('Valor') as HTMLInputElement, '10')
  await clicar(botao('Lançar adiantamento'))
  assert.deepEqual(criados, [{ usuarioId: 'u2', mes: '2026-10', valor: 10, data: null, observacao: '' }])
})

test('a introdução diz que o adiantamento fixo mora na aba Funcionários e não entra na lista', async () => {
  await montar()
  assert.match(texto(document.body), /O adiantamento fixo de cada pessoa fica na aba Funcionários e não entra nesta lista\./)
})

test('a seta aponta para o detalhe aberto pelo id', async () => {
  await montar()
  assert.equal(seta('Vendedor A')?.getAttribute('aria-controls'), null)
  await clicar(seta('Vendedor A'))
  const alvo = seta('Vendedor A')?.getAttribute('aria-controls')
  assert.ok(alvo)
  assert.equal(document.getElementById(alvo), detalhe('a1'))
})

test('a linha aberta continua aberta quando outra linha some no re-render (key estável)', async () => {
  await montar()
  await clicar(seta('Mecânico D'))
  await renderizar(ADIANTAMENTOS.filter(a => a.id !== 'a1'))
  assert.equal(seta('Mecânico D')?.getAttribute('aria-expanded'), 'true')
  assert.ok(removerDoDetalhe('a2'))
  assert.equal(seta('Vendedor A'), undefined)
  assert.equal(seta('Sem nome')?.getAttribute('aria-expanded'), 'false')
})

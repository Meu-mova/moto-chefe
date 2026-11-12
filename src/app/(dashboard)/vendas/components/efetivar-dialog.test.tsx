// Efetivação (#726): a Entrega chega pronta do pedido e a tela só a mostra para conferir.
// As Server Actions são a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar } from '@/test/eventos-dom'
import type { EntregaVenda } from '@/lib/notagateway/entrega'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

const enviados: unknown[][] = []
mock.module('../actions', { namedExports: { efetivarVendaAction: async (...a: unknown[]) => { enviados.push(a); return { ok: true, dados: undefined } } } })
mock.module('@/app/(dashboard)/clientes/actions', { namedExports: {
  buscarClientesAction: async () => [], criarClienteAction: async () => ({ ok: true, dados: undefined }),
} })

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const desmontar of montados.splice(0)) await desmontar() })

const entregaNaTela = () => document.querySelector('[aria-label="Entrega do pedido"]')?.textContent ?? ''

async function abrir(entrega: EntregaVenda | null, origens: { id: string; nome: string; tipo: string; pedeDetalhe: boolean }[] = []) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { EfetivarDialog } = await import('./efetivar-dialog')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(EfetivarDialog, { pedidoId: 'p1', chassi: 'LA1', modelo: 'MC JET', origens, entrega })) })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
  await clicar([...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Efetivar Venda'))
}

const ENTREGAR: EntregaVenda = {
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente',
  endereco: { cep: '65000000', logradouro: 'Rua de exemplo', numero: '100', complemento: '', bairro: 'Centro', cidade: '2111300', nomeCidade: 'São Luís', uf: 'MA' },
  recebe: null,
}

test('"Entregar" do pedido: endereço, quem recebe (o comprador) e a modalidade, só para conferir', async () => {
  await abrir(ENTREGAR)
  const texto = entregaNaTela()
  assert.match(texto, /Entregar em São Luís\/MA \(do pedido\)/)
  assert.match(texto, /Rua de exemplo, 100, Centro, São Luís\/MA, CEP 65000-000/)
  assert.match(texto, /Quem recebe: o comprador/)
  assert.match(texto, /Modalidade: Loja leva com veículo próprio/)
})

test('outra pessoa recebe: a efetivação mostra o nome dela', async () => {
  await abrir({ ...ENTREGAR, recebe: { nome: 'Maria Exemplo', cpfCnpj: '52998224725' } } as EntregaVenda)
  assert.match(entregaNaTela(), /Quem recebe: Maria Exemplo/)
})

test('"Retira na loja" do pedido e pedido antigo sem Entrega', async () => {
  await abrir({ modo: 'retira', modalidade: '' })
  assert.match(entregaNaTela(), /Retira na loja \(do pedido\)/)
  assert.match(entregaNaTela(), /Modalidade: não escolhida/)
  for (const d of montados.splice(0)) await d()
  await abrir(null)
  assert.match(entregaNaTela(), /Pedido sem a Entrega informada/)
})

// Frete cobrado (#726, 4b): a efetivação mostra o frete do pedido e o total; o servidor soma o frete do pedido.
test('pedido com frete: mostra o frete cobrado, pede o valor da moto e soma o total', async () => {
  const { digitar } = await import('@/test/eventos-dom')
  await abrir({ ...ENTREGAR, frete: 350 } as EntregaVenda)
  assert.match(entregaNaTela(), /Frete cobrado: R\$\s*350,00/)
  const rotulo = [...document.querySelectorAll('label')].find(l => /^Valor da moto/.test(l.textContent ?? ''))
  assert.ok(rotulo, 'o campo de valor diz que é o valor da moto')
  const campo = rotulo.parentElement!.querySelector('input')!
  await digitar(campo, '1000000')
  assert.match(document.body.textContent ?? '', /Total \(moto \+ frete\): R\$\s*10\.350,00/)
})

test('pedido sem frete continua com "Valor (R$)" e sem total à parte', async () => {
  await abrir(ENTREGAR)
  assert.ok([...document.querySelectorAll('label')].some(l => (l.textContent ?? '') === 'Valor (R$)'))
  assert.doesNotMatch(document.body.textContent ?? '', /Total \(moto \+ frete\)/)
})

// Pagamento do pedido (#775): a tela de hoje tem uma forma só e manda uma lista com ela, valendo moto + frete.
test('efetivar manda a forma escolhida como lista de um pagamento, com o total (moto + frete)', async () => {
  const { digitar } = await import('@/test/eventos-dom')
  enviados.splice(0)
  await abrir({ ...ENTREGAR, frete: 350 } as EntregaVenda, [{ id: 'o1', nome: 'Passou na porta', tipo: 'outro', pedeDetalhe: false }])
  const campoDe = (rotulo: RegExp) => [...document.querySelectorAll('label')].find(l => rotulo.test(l.textContent ?? ''))!.parentElement!.querySelector('input')!
  await digitar(campoDe(/^Nome do Cliente/), 'Cliente sintético')
  await digitar(campoDe(/^CPF\/CNPJ/), '52998224725')
  await digitar(campoDe(/^Valor da moto/), '1000000')
  const { escolher } = await import('@/test/eventos-dom')
  await escolher(document.querySelector('select')!, 'o1')
  await clicar([...document.querySelectorAll('button')].find(b => /Selecionar/.test(b.textContent ?? '')))
  const { act } = await import('react')
  const opcao = [...document.querySelectorAll('[role="option"]')].find(o => o.textContent?.trim() === 'Dinheiro')!
  // O Select do @base-ui escolhe no ciclo do ponteiro, não só no click.
  await act(async () => {
    for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) opcao.dispatchEvent(new window.MouseEvent(tipo, { bubbles: true }))
  })
  await clicar([...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Confirmar Venda'))
  assert.equal(enviados.length, 1)
  assert.deepEqual(enviados[0].slice(3, 5), ['10000.00', [{ tipo: 'dinheiro', valor: 10350 }]])
})

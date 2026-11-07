// Efetivação (#726): a Entrega chega pronta do pedido e só se mostra; o navegador não a manda de novo.
// As Server Actions são a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar } from '@/test/eventos-dom'
import type { EntregaVenda } from '@/lib/notagateway/entrega'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

mock.module('../actions', { namedExports: { efetivarVendaAction: async () => ({ ok: true, dados: undefined }) } })
mock.module('@/app/(dashboard)/clientes/actions', { namedExports: {
  buscarClientesAction: async () => [], criarClienteAction: async () => ({ ok: true, dados: undefined }),
} })

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const desmontar of montados.splice(0)) await desmontar() })

const entregaNaTela = () => document.querySelector('[aria-label="Entrega do pedido"]')?.textContent ?? ''

async function abrir(entrega: EntregaVenda | null) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { EfetivarDialog } = await import('./efetivar-dialog')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(EfetivarDialog, { pedidoId: 'p1', chassi: 'LA1', modelo: 'MC JET', origens: [], entrega })) })
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

// Card do pedido (#776): pedido em aprovação mostra "Aguardando aprovação" e esconde Efetivar e Cancelar,
// que o servidor também recusa enquanto a aprovação não sai.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { PedidoComDetalhes } from '@/lib/queries/vendas'
import { montarDom } from '@/test/montar-dom'

const { desmontar } = montarDom()
after(desmontar)

mock.module('../actions', { namedExports: {
  cancelarPedidoAction: async () => ({ ok: true }), efetivarVendaAction: async () => ({ ok: true }), buscarPrecoMinimoAction: async () => null,
} })
mock.module('@/app/(dashboard)/clientes/actions', { namedExports: {
  buscarClientesAction: async () => [], criarClienteAction: async () => ({ ok: true, dados: undefined }),
} })

const PEDIDO = {
  id: 'p1', numero: 77, status: 'pendente', motoId: 'm1', lojaId: 'loja-1', vendedorId: 'v1', chassi: 'CHASSI1', cor: 'CINZA',
  marca: 'MOTOCHEFE', modelo: 'JET', lojaNome: 'Loja Exemplo', vendedorNome: 'Vendedor Exemplo', observacao: null,
  dataPedido: new Date('2026-11-14T12:00:00Z'), entrega: null, disponibilidade: 'reservada',
} as unknown as PedidoComDetalhes

let desmontarCard: (() => Promise<void>) | null = null
afterEach(async () => { await desmontarCard?.(); desmontarCard = null; document.body.innerHTML = '' })

async function desenhar(pedido: PedidoComDetalhes) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { PedidoCard } = await import('./pedido-card')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(PedidoCard, { pedido, papel: 'aux_adm', usuarioId: 'u1', lojaIdUsuario: 'loja-1', origens: [], podeAprovarSensivel: false }))
  })
  desmontarCard = () => act(async () => { root.unmount() })
}
const botoes = () => [...document.querySelectorAll('button')].map(b => b.textContent?.trim())

test('pedido pendente com a moto reservada: Efetivar e Cancelar', async () => {
  await desenhar(PEDIDO)
  assert.ok(botoes().includes('Efetivar Venda'))
  assert.ok(botoes().includes('Cancelar'))
  assert.doesNotMatch(document.body.textContent ?? '', /Aguardando aprovação/)
})

test('pedido em aprovação: "Aguardando aprovação", sem Efetivar nem Cancelar', async () => {
  await desenhar({ ...PEDIDO, disponibilidade: 'aguardando_aprovacao' } as PedidoComDetalhes)
  assert.match(document.body.textContent ?? '', /Aguardando aprovação/)
  assert.ok(!botoes().includes('Efetivar Venda'))
  assert.ok(!botoes().includes('Cancelar'))
})

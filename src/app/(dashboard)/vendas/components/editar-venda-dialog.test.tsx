// Editar venda com frete cobrado (#726, 4b): o valor da venda inclui o frete, e a tela diz isso.
// As Server Actions são a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar } from '@/test/eventos-dom'
import type { VendaComDetalhes } from '@/lib/queries/vendas'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

mock.module('../actions', { namedExports: { editarVendaAction: async () => ({ ok: true, dados: undefined }) } })
mock.module('@/components/use-maquininhas', { namedExports: { useMaquininhas: () => [] } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const d of montados.splice(0)) await d() })

const ENTREGA = {
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente', recebe: null, frete: 350,
  endereco: { cep: '', logradouro: 'Rua', numero: '1', complemento: '', bairro: 'B', cidade: '2111300', nomeCidade: 'São Luís', uf: 'MA' },
}

async function abrir(entrega: unknown) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { EditarVendaDialog } = await import('./editar-venda-dialog')
  const venda = {
    id: 'v1', numero: 1, lojaId: 'l1', valor: '10350.00', dataVenda: new Date('2026-11-07T12:00:00Z'),
    pagamentos: [{ tipo: 'pix', valor: 10350 }], clienteNome: 'Cliente', clienteCpf: '52998224725', freteCobrado: (entrega as { frete?: number } | null)?.frete ?? null,
  } as unknown as VendaComDetalhes
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(EditarVendaDialog, { venda, papel: 'admin_socio', vendedores: [], origens: [] })) })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
  await clicar(document.querySelector('button[title="Editar venda"]'))
}

const texto = () => document.body.textContent ?? ''

test('venda com frete: o valor total diz que inclui o frete e por quanto a moto sai na nota', async () => {
  await abrir(ENTREGA)
  assert.match(texto(), /Inclui o frete cobrado de R\$\s*350,00: a moto sai na nota por R\$\s*10\.000,00\./)
  const campo = [...document.querySelectorAll('label')].find(l => /^Valor Total/.test(l.textContent ?? ''))!.parentElement!.querySelector('input')!
  await digitar(campo, '1000000')
  assert.match(texto(), /a moto sai na nota por R\$\s*9\.650,00\./)
})

test('venda sem frete: nenhum aviso de frete', async () => {
  await abrir(null)
  assert.doesNotMatch(texto(), /Inclui o frete/)
})

test('valor que não cobre o frete: a tela diz para corrigir, sem valor negativo para a moto', async () => {
  await abrir(ENTREGA)
  const campo = [...document.querySelectorAll('label')].find(l => /^Valor Total/.test(l.textContent ?? ''))!.parentElement!.querySelector('input')!
  await digitar(campo, '30000')
  assert.match(texto(), /O valor não cobre o frete cobrado de R\$\s*350,00\. Corrija o valor: ele inclui o frete\./)
  assert.doesNotMatch(texto(), /a moto sai na nota por/)
})

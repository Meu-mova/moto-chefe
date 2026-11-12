import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar, escolher } from '@/test/eventos-dom'

const { desmontar } = montarDom()
after(desmontar)

const save = mock.fn(async (_osId: string, _item: unknown) => ({ ok: true as const }))
const showError = mock.fn()
mock.module('../../actions', { namedExports: {
  adicionarItemOSAction: save,
  removerItemOSAction: async () => ({ ok: true }),
} })
mock.module('sonner', { namedExports: { toast: { error: showError } } })

let unmount: (() => Promise<void>) | undefined
afterEach(async () => {
  await unmount?.()
  save.mock.resetCalls()
  showError.mock.resetCalls()
})

async function renderPanel() {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { OSItensPanel } = await import('./os-itens-panel')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  unmount = async () => { await act(async () => root.unmount()); container.remove() }
  await act(async () => root.render(createElement(OSItensPanel, {
    osId: 'os-test', itens: [], podeEditar: true, pecas: [],
    servicos: [{ id: 'warranty', nome: 'Garantia', valor: '0.00', tempoPrevistoMinutos: null }],
  })))
  return {
    description: container.querySelector<HTMLInputElement>('[placeholder="Descrição"]')!,
    quantity: container.querySelector<HTMLInputElement>('[placeholder="Qtd"]')!,
    price: container.querySelector<HTMLInputElement>('[placeholder="Valor unit. (R$)"]')!,
    catalog: container.querySelector('select')!,
    add: [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Adicionar')!,
  }
}

for (const price of ['0', '25.50']) {
  test(`envia serviço com valor ${price} e limpa a descrição após sucesso`, async () => {
    const form = await renderPanel()
    await digitar(form.description, 'Revisão')
    await digitar(form.price, price)
    await clicar(form.add)
    assert.equal(showError.mock.callCount(), 0)
    assert.equal(save.mock.callCount(), 1)
    assert.deepEqual(save.mock.calls[0]?.arguments, ['os-test', {
      tipo: 'servico', descricao: 'Revisão', quantidade: 1, valorUnitario: Number(price),
      servicoId: null, pecaId: null,
    }])
    assert.equal(form.description.value, '')
  })
}

test('envia serviço gratuito selecionado do catálogo', async () => {
  const form = await renderPanel()
  await escolher(form.catalog, 'warranty')
  await clicar(form.add)
  assert.equal(showError.mock.callCount(), 0)
  assert.equal(save.mock.callCount(), 1)
  assert.deepEqual(save.mock.calls[0]?.arguments, ['os-test', {
    tipo: 'servico', descricao: 'Garantia', quantidade: 1, valorUnitario: 0,
    servicoId: 'warranty', pecaId: null,
  }])
})

for (const [quantity, price] of [['0', '10'], ['-1', '10'], ['', '10'], ['1', '-1'], ['1', '']]) {
  test(`não envia item com quantidade ${JSON.stringify(quantity)} e valor ${JSON.stringify(price)}`, async () => {
    const form = await renderPanel()
    await digitar(form.description, 'Revisão')
    await digitar(form.quantity, quantity)
    await digitar(form.price, price)
    await clicar(form.add)
    assert.equal(save.mock.callCount(), 0)
    assert.equal(showError.mock.callCount(), 1)
    assert.equal(form.description.value, 'Revisão')
  })
}

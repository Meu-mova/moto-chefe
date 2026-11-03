// Campo do valor real pago (#628): o que ele mostra e o que manda à Server Action.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)

// Fronteira de fora: a Server Action. O teste olha o que a tela manda a ela.
const gravadas: unknown[] = []
const acaoMock = mock.module('../actions', { namedExports: { salvarValorRealAction: async (dados: unknown) => { gravadas.push(dados) } } })
const toastMock = mock.module('sonner', { namedExports: { toast: { error: () => {} } } })
after(() => { acaoMock.restore(); toastMock.restore() })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  gravadas.length = 0
})

async function montar(valorReal: number | null, totalPagar: number) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ValorRealInput } = await import('./valor-real-input')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const raiz = createRoot(el)
  raizes.push(raiz)
  await act(async () => {
    raiz.render(React.createElement(ValorRealInput, { usuarioId: 'u1', nome: 'Vendedor A', mes: '2026-10', valorReal, totalPagar }))
  })
  return el
}

const campo = () => document.querySelector('input') as HTMLInputElement

test('sem valor real, o campo convida a informar (nunca "—")', async () => {
  await montar(null, 3165)
  assert.equal(campo().placeholder, 'Informar')
  assert.equal(campo().getAttribute('aria-label'), 'Valor real pago de Vendedor A')
  assert.doesNotMatch(document.body.textContent ?? '', /confere|calculado/)
})

test('valor igual ao calculado mostra "confere"; diferente mostra a diferença do calculado', async () => {
  await montar(4180.4, 4180.4)
  assert.match(document.body.textContent ?? '', /confere/)
  document.body.innerHTML = ''
  await montar(2400, 2384)
  assert.match(document.body.textContent ?? '', /\+R\$ 16,00 do calculado/)
})

test('digitar o valor e sair do campo grava o número lido, com usuário e mês', async () => {
  const { act } = await import('react')
  await montar(null, 4180.4)
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(campo(), '4.180,40')
    campo().dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await act(async () => { campo().dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })) })
  assert.deepEqual(gravadas, [{ usuarioId: 'u1', mes: '2026-10', valor: 4180.4 }])
})

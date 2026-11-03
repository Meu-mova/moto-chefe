// Campo do comprovante do sinal: arquivo que não serve mostra o motivo e não libera o
// botão (onChange(null)); foto/PDF libera e vai no FormData como 'comprovante'.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)

mock.module('../actions', { namedExports: { abrirComprovanteSinalAction: async () => 'https://x' } })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.replaceChildren()
})

async function montarCampo() {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ComprovanteSinalCampo } = await import('./comprovante-sinal')
  const recebidos: (File | null)[] = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const raiz = createRoot(container)
  raizes.push(raiz)
  await act(async () => { raiz.render(React.createElement(ComprovanteSinalCampo, { onChange: (f: File | null) => recebidos.push(f) })) })
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  async function escolher(arquivo: File) {
    Object.defineProperty(input, 'files', { value: [arquivo], configurable: true })
    await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
  }
  return { input, recebidos, escolher, container }
}

test('aceita só foto e PDF, e o input diz isso ao navegador', async () => {
  const { input } = await montarCampo()
  assert.equal(input.accept, 'image/jpeg,image/png,image/webp,application/pdf')
})

test('arquivo que não serve: mostra o motivo e não libera', async () => {
  const { recebidos, escolher, container } = await montarCampo()
  await escolher(new File(['x'], 'a.txt', { type: 'text/plain' }))
  assert.deepEqual(recebidos, [null])
  assert.match(container.textContent ?? '', /Formato não suportado/)
})

test('PDF libera e vai no FormData como "comprovante"', async () => {
  const { recebidos, escolher } = await montarCampo()
  const pdf = new File(['%PDF'], 'sinal.pdf', { type: 'application/pdf' })
  await escolher(pdf)
  assert.equal(recebidos.at(-1), pdf)
  const { formDataDoComprovante } = await import('./comprovante-sinal')
  assert.equal(formDataDoComprovante(pdf).get('comprovante'), pdf)
})

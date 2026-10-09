// Regressão: com o cliente JÁ cadastrado, a busca automática por CPF respondia
// mesclando o estado de antes da última tecla e o CPF voltava a 10 dígitos —
// clienteCompleto virava falso e o botão de registrar sinal nunca habilitava.
import { JSDOM } from 'jsdom'
import test, { mock } from 'node:test'
import assert from 'node:assert'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
const g = globalThis as Record<string, unknown>
g.window = dom.window; g.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'InputEvent', 'MouseEvent', 'NodeList', 'getComputedStyle']) {
  g[k] = (dom.window as unknown as Record<string, unknown>)[k]
}
g.IS_REACT_ACT_ENVIRONMENT = true
g.fetch = async () => ({ json: async () => ({ erro: true }) })

const CPF = '877.979.506-44'

function digitar(el: HTMLInputElement, v: string) {
  const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
  set.call(el, v)
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
}

test('CPF de cliente já cadastrado sobrevive à busca automática', async () => {
  mock.module('../../vendas/actions', {
    namedExports: {
      buscarClientePorCpfAction: async () => ({
        source: 'clientes', nome: 'Marcus Vinicius', celular: '(31) 98771-2953',
        email: null, cep: null, logradouro: null, numero: null,
        complemento: null, bairro: null, cidade: null, estado: null,
      }),
    },
  })

  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ClienteCampos, CLIENTE_VAZIO, clienteCompleto } = await import('./cliente-campos')

  let ultimo = CLIENTE_VAZIO
  function Harness() {
    const [cliente, setCliente] = React.useState(CLIENTE_VAZIO)
    ultimo = cliente
    return React.createElement(ClienteCampos, { value: cliente, onChange: setCliente })
  }

  const root = createRoot(document.getElementById('root')!)
  await act(async () => { root.render(React.createElement(Harness)) })

  const inputCpf = [...document.querySelectorAll('input')]
    .find(i => i.placeholder === 'CPF ou CNPJ') as HTMLInputElement

  for (let i = 1; i <= CPF.length; i++) {
    await act(async () => { digitar(inputCpf, CPF.slice(0, i)) })
  }
  await act(async () => { await new Promise(r => setTimeout(r, 50)) })

  assert.equal(ultimo.clienteCpf, CPF, 'o CPF não pode perder o último dígito depois da busca')
  assert.ok(clienteCompleto(ultimo), 'o botão precisa habilitar com os dados vindos do cadastro')
})

test('demanda com CNPJ válido fica completa; com dígito errado, não', async () => {
  const { CLIENTE_VAZIO, clienteCompleto } = await import('./cliente-campos')
  const empresa = { ...CLIENTE_VAZIO, clienteNome: 'Locadora Exemplo Ltda', clienteCelular: '(35) 99999-0001' }
  assert.ok(clienteCompleto({ ...empresa, clienteCpf: '11.222.333/0001-81' }))
  assert.ok(!clienteCompleto({ ...empresa, clienteCpf: '11.222.333/0001-82' }))
})

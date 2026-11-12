// "Vender" do Showroom com a Entrega (#852): o que o diálogo envia e onde a recusa aparece.
// As actions do servidor são a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar, escolher } from '@/test/eventos-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

type Resposta = { ok: true; dados: unknown } | { ok: false; erro: string }
const OK_VENDA: Resposta = { ok: true, dados: { kommo: { resultado: 'erro' } } }
const registrar = mock.fn(async (_payload: Record<string, unknown>): Promise<Resposta> => OK_VENDA)
const solicitar = mock.fn(async (_payload: Record<string, unknown>, _motivo: string, _tipo?: string): Promise<Resposta> => ({ ok: true, dados: undefined }))
mock.module('../../vendas/actions', { namedExports: {
  registrarVendaCompletaAction: (p: Record<string, unknown>) => registrar(p),
  solicitarAprovacaoVendaAction: (p: Record<string, unknown>, m: string, t?: string) => solicitar(p, m, t),
  registrarReservaAction: async () => ({ ok: true, dados: { id: 'r1' } }),
  buscarPrecoMinimoAction: async () => null,
  buscarClientePorCpfAction: async () => null,
} })
mock.module('@/app/(dashboard)/maquininhas-actions', { namedExports: { maquininhasDoRegistroAction: async () => [] } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  registrar.mock.resetCalls()
  solicitar.mock.resetCalls()
  registrar.mock.mockImplementation(async () => OK_VENDA)
  for (const desmontar of montados.splice(0)) await desmontar()
})

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const textoDaTela = () => document.body.textContent ?? ''
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)
const campo = <T extends HTMLElement>(rotulo: RegExp) => {
  // Só rótulo ligado a um campo: o "CEP" do comprador não tem id, o da Entrega tem.
  const label = [...document.querySelectorAll('label')].find(l => l.htmlFor && rotulo.test((l.textContent ?? '').trim()))
  const el = label?.htmlFor ? document.getElementById(label.htmlFor) : null
  assert.ok(el, `campo com o rótulo ${rotulo} não está na tela`)
  return el as T
}

// Reserva ativa preenche o comprador e a entrada; falta só a forma do restante, a origem e a Entrega.
const RESERVA = {
  valorEntrada: '1000.00', valorTotal: '12000.00', meioPagamento: 'pix', pagamentos: [{ tipo: 'pix', valor: 1000 }],
  clienteNome: 'Cliente sintético', clienteCpf: '529.982.247-25', clienteCelular: '(35) 99999-0774', clienteEmail: 'c@example.com',
  clienteCep: '', clienteLogradouro: '', clienteNumero: '', clienteComplemento: '', clienteBairro: '', clienteCidade: '', clienteEstado: 'MG',
  vendedorId: 'u1',
}
const ORIGEM = { id: 'origem-1', nome: 'Passou na porta', tipo: 'presencial', pedeDetalhe: false }

async function montar(props: Record<string, unknown> = {}) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { VenderButton } = await import('./vender-button')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(VenderButton, {
      motoId: 'moto-1', descricao: 'MC JET', vendedorId: 'u1', vendedorNome: 'Vendedor', papel: 'vendedor', usuarios: [],
      reservaAtiva: RESERVA, origens: [ORIGEM], abrirAoMontar: true, ...props,
    }))
  })
  const clique = async (el: Element | null | undefined, ms = 50) => { await clicar(el); await act(() => esperar(ms)) }
  let montado = true
  montados.push(() => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() }))
  await act(() => esperar(50))
  return { clique, act }
}

/** Forma do pagamento restante: o <Select> do design system abre a lista e a opção se escolhe com o ponteiro. */
async function pagarRestanteCom(t: Awaited<ReturnType<typeof montar>>, forma: string) {
  const gatilho = [...document.querySelectorAll('button, [role="combobox"]')].find(b => /Forma de pagamento/.test(b.textContent ?? ''))
  await t.clique(gatilho)
  const opcao = [...document.querySelectorAll('[role="option"]')].find(o => (o.textContent ?? '').trim() === forma)
  assert.ok(opcao, `opção ${forma} não está na lista`)
  // Só o clique escolhe a 1ª opção; as outras pedem o ponteiro passando por elas antes, como no navegador.
  await t.act(async () => {
    for (const tipo of ['pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup']) opcao.dispatchEvent(new window.MouseEvent(tipo, { bubbles: true }))
  })
  await t.clique(opcao)
  assert.match(gatilho?.textContent ?? '', /\S/, 'a forma de pagamento não foi escolhida')
}

async function preencherVenda(t: Awaited<ReturnType<typeof montar>>, forma = 'PIX') {
  await pagarRestanteCom(t, forma)
  // O select da origem não tem id: acha-se pela opção da origem.
  await escolher(document.querySelector(`option[value="${ORIGEM.id}"]`)?.closest('select') as HTMLSelectElement, ORIGEM.id)
  await escolher(campo<HTMLSelectElement>(/^Modalidade do frete na nota/), 'TransporteProprioPorContaDoDestinatario')
  await t.act(() => esperar(20))
}

test('o "Vender" mostra o bloco de Entrega com "Retira na loja" marcada e o aviso de modalidade vazia', async () => {
  await montar()
  assert.match(textoDaTela(), /Retira na loja/)
  assert.match(textoDaTela(), /Escolha a modalidade do frete\. Sem ela a nota não sai\./)
})

test('a venda direta envia a Entrega e a modalidade junto com o resto da venda', async () => {
  const t = await montar()
  await preencherVenda(t)
  await t.clique(botao('Confirmar Venda'))
  assert.equal(registrar.mock.callCount(), 1)
  const enviado = registrar.mock.calls[0].arguments[0]
  assert.deepEqual(enviado.entrega, { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' })
  assert.equal(enviado.valorTotal, '12000.00')
})

test('o pedido de aprovação (transferência) também envia a Entrega', async () => {
  const t = await montar()
  await preencherVenda(t, 'Transferência Bancária')
  await t.clique(botao('Pedir aprovação'))
  assert.equal(solicitar.mock.callCount(), 1)
  assert.deepEqual(solicitar.mock.calls[0].arguments[0].entrega, { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' })
})

test('a recusa do servidor aparece dentro do diálogo, sem fechar nem apagar o que foi digitado', async () => {
  registrar.mock.mockImplementation(async () => ({ ok: false, erro: 'A entrega em outro estado ainda não sai pelo MOVA.' }))
  const t = await montar()
  await preencherVenda(t)
  await t.clique(botao('Confirmar Venda'))
  const alerta = document.querySelector('[role="alert"]')
  assert.equal(alerta?.textContent, 'A entrega em outro estado ainda não sai pelo MOVA.')
  assert.ok(botao('Confirmar Venda'), 'o diálogo fechou')
  assert.equal(campo<HTMLSelectElement>(/^Modalidade do frete na nota/).value, 'TransporteProprioPorContaDoDestinatario')
})

test('a reserva não mostra o bloco de Entrega', async () => {
  const t = await montar({ reservaAtiva: undefined })
  assert.match(textoDaTela(), /Retira na loja/)
  await t.clique(botao('Reserva'))
  assert.doesNotMatch(textoDaTela(), /Retira na loja/)
  assert.doesNotMatch(textoDaTela(), /Modalidade do frete na nota/)
})

const porPlaceholder = (texto: RegExp, n = 0) => {
  const el = [...document.querySelectorAll<HTMLInputElement>('input')].filter(i => texto.test(i.placeholder))[n]
  assert.ok(el, `campo com o placeholder ${texto} não está na tela`)
  return el
}

test('a recusa some ao trocar para Reserva', async () => {
  registrar.mock.mockImplementation(async () => ({ ok: false, erro: 'Recusa sintética.' }))
  const t = await montar({ reservaAtiva: undefined })
  await digitar(porPlaceholder(/^CPF ou CNPJ$/), '52998224725')
  await digitar(porPlaceholder(/^Nome/), 'Cliente sintético')
  await digitar(porPlaceholder(/^\(00\)/), '35999990774')
  await digitar(porPlaceholder(/^email@/), 'c@example.com')
  await digitar(porPlaceholder(/^0,00$/, 0), '1200000')
  await digitar(porPlaceholder(/^0,00$/, 1), '1200000')
  await preencherVenda(t)
  await t.clique(botao('Confirmar Venda'))
  assert.equal(document.querySelector('[role="alert"]')?.textContent, 'Recusa sintética.')
  await t.clique(botao('Reserva'))
  assert.equal(document.querySelector('[role="alert"]'), null)
})

const opcaoDeEntrega = (nome: RegExp) => [...document.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input[type="radio"]')]
  .find(r => nome.test(r.closest('label')?.textContent ?? ''))
const ENDERECO_SAO_LUIS = {
  cep: '65000-000', logradouro: 'Rua de exemplo', numero: '100', complemento: '', bairro: 'Centro', cidade: '2111300', nomeCidade: 'São Luís', uf: 'MA',
}

async function entregarEmSaoLuis(t: Awaited<ReturnType<typeof montar>>) {
  mock.method(globalThis, 'fetch', async () => Response.json({ logradouro: 'Rua de exemplo', bairro: 'Centro', localidade: 'São Luís', uf: 'MA', ibge: '2111300' }))
  await t.clique(opcaoDeEntrega(/Entregar/))
  await digitar(campo<HTMLInputElement>(/^CEP/), '65000000')
  await t.act(() => esperar(50))
  await digitar(campo<HTMLInputElement>(/^Número/), '100')
  await t.clique(campo<HTMLInputElement>(/^Outra pessoa recebe/))
  await digitar(campo<HTMLInputElement>(/^Nome de quem recebe/), 'Maria Exemplo')
}

test('"Entregar" com endereço e outra pessoa recebendo vai inteiro para a venda', async () => {
  const t = await montar()
  await preencherVenda(t)
  await entregarEmSaoLuis(t)
  await digitar(campo<HTMLInputElement>(/^CPF ou CNPJ de quem recebe/), '52998224725')
  await t.clique(botao('Confirmar Venda'))
  mock.restoreAll()
  assert.deepEqual(registrar.mock.calls[0]?.arguments[0].entrega, {
    modo: 'entregar', modalidade: 'TransporteProprioPorContaDoDestinatario', endereco: ENDERECO_SAO_LUIS,
    recebe: { nome: 'Maria Exemplo', cpfCnpj: '529.982.247-25' },
  })
})

test('quem recebe com CPF inválido deixa "Confirmar Venda" desabilitado', async () => {
  const t = await montar()
  await preencherVenda(t)
  await entregarEmSaoLuis(t)
  await digitar(campo<HTMLInputElement>(/^CPF ou CNPJ de quem recebe/), '52998224724')
  mock.restoreAll()
  assert.equal(botao('Confirmar Venda')?.disabled, true)
  await t.clique(botao('Confirmar Venda'))
  assert.equal(registrar.mock.callCount(), 0)
})

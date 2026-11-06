// Novo pedido de venda com a Entrega (#725, layout B da #682): o que a tela mostra e o que envia ao
// servidor. A action é a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, escolher } from '@/test/eventos-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

type Resposta = { ok: true; dados: undefined } | { ok: false; erro: string }
const criar = mock.fn(async (_motoId: string, _observacao: string, _entrega: unknown): Promise<Resposta> => ({ ok: true, dados: undefined }))
mock.module('../actions', { namedExports: {
  criarPedidoVendaAction: (motoId: string, observacao: string, entrega: unknown) => criar(motoId, observacao, entrega),
} })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  criar.mock.resetCalls()
  for (const desmontar of montados.splice(0)) await desmontar()
})

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const textoDaTela = () => document.body.textContent ?? ''
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)
// Campo pelo rótulo visível; a asserção diz qual faltou, em vez de um TypeError adiante.
const campo = <T extends HTMLElement>(rotulo: RegExp) => {
  const label = [...document.querySelectorAll('label')].find(l => rotulo.test((l.textContent ?? '').trim()))
  const el = label?.htmlFor ? document.getElementById(label.htmlFor) : null
  assert.ok(el, `campo com o rótulo ${rotulo} não está na tela`)
  return el as T
}
const opcaoDeEntrega = (nome: RegExp) => [...document.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input[type="radio"]')]
  .find(r => nome.test(r.closest('label')?.textContent ?? ''))
const resumo = () => document.querySelector('[aria-label="Resumo do pedido"]')?.textContent ?? ''

const MOTO = { id: 'moto-1', chassi: 'LA2026X4131', marca: 'MC', modelo: 'JET', cor: 'CINZA', lojaNome: 'Loja Centro' }
const AVISO = 'Escolha a modalidade do frete. Sem ela a nota não sai.'

async function montar() {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { CriarPedidoDialog } = await import('./criar-pedido-dialog')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(CriarPedidoDialog, { motos: [MOTO], papel: 'vendedor' })) })
  const clique = async (el: Element | null | undefined, ms = 50) => { await clicar(el); await act(() => esperar(ms)) }
  let montado = true
  montados.push(() => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() }))
  await clique(botao('Criar Pedido de Venda'))
  return { clique }
}

test('abre com "Retira na loja" marcada, sem "Entregar" e sem nenhuma modalidade escolhida, avisando', async () => {
  await montar()
  assert.equal(opcaoDeEntrega(/Retira na loja/)?.checked, true)
  assert.equal(opcaoDeEntrega(/Entregar/), undefined)
  assert.equal(campo<HTMLSelectElement>(/^Modalidade do frete na nota/).value, '')
  assert.match(textoDaTela(), new RegExp(AVISO))
  assert.match(resumo(), /Retira na loja/)
  assert.match(resumo(), /Não escolhida/)
})

test('envia a moto e a Entrega com a modalidade escolhida; o aviso some e o resumo mostra a modalidade', async () => {
  const t = await montar()
  await escolher(campo<HTMLSelectElement>(/^Moto disponível/), MOTO.id)
  await escolher(campo<HTMLSelectElement>(/^Modalidade do frete na nota/), 'TransporteProprioPorContaDoDestinatario')
  assert.doesNotMatch(textoDaTela(), new RegExp(AVISO))
  assert.match(resumo(), /Cliente leva com veículo próprio/)
  await t.clique(botao('Criar pedido'))
  assert.deepEqual(criar.mock.calls.map(c => c.arguments), [
    [MOTO.id, '', { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' }],
  ])
})

test('sem modalidade o pedido sai assim mesmo (avisa, não bloqueia) com a modalidade vazia', async () => {
  const t = await montar()
  await escolher(campo<HTMLSelectElement>(/^Moto disponível/), MOTO.id)
  await t.clique(botao('Criar pedido'))
  assert.deepEqual(criar.mock.calls.map(c => c.arguments), [[MOTO.id, '', { modo: 'retira', modalidade: '' }]])
})

test('o cabeçalho mostra a loja da moto escolhida, que é onde o pedido nasce', async () => {
  await montar()
  const subtitulo = () => document.querySelector('[data-slot="dialog-description"]')?.textContent ?? ''
  assert.equal(subtitulo(), 'Escolha a moto para ver a loja do pedido.')
  await escolher(campo<HTMLSelectElement>(/^Moto disponível/), MOTO.id)
  assert.equal(subtitulo(), 'Loja Centro')
})

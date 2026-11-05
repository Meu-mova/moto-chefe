import { test, before, after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, act } from 'react'
import type { Root } from 'react-dom/client'
import type { PreviaNfe } from '../../vendas/nfe-propria-actions'
import { RENAVE_COMPLETO_FATURAMENTO_DIRETO } from '@/test/renave-completo'
import type { DadosTransporte } from '@/lib/notagateway/transporte'
import type { NotaResumo } from '../../vendas/nfe-propria-actions'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)
let root: Root | undefined

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  document.body.replaceChildren()
  acoes = acoesInesperadas()
})

const preview: Extract<PreviaNfe, { ok: true }> = {
  ok: true, vendaId: 'venda-teste', vendaNumero: 1, ambiente: 'Homologacao',
  jaFaturada: null, pendencias: [],
  ficha: { xProd: 'Ciclomotor de teste', ncm: '87116000', cest: '', unidade: 'UN', origem: '0' },
  sugestao: { xProd: 'Ciclomotor de teste', ncm: '87116000', cest: '', unidade: 'UN', origem: '0' },
  exigeRenave: true,
  renave: {
    ...RENAVE_COMPLETO_FATURAMENTO_DIRETO,
  },
  renaveOrigem: {},
  transporteAnterior: null,
  resumo: {
    cliente: { nome: 'Comprador de teste', documento: '35281765043', endereco: 'Rua de teste, 10', email: null },
    produto: { descricao: 'Ciclomotor de teste', ncm: '87116000', cest: '', cfop: '5102', cst: '102', origemEntrada: '0', origemSaida: '0' },
    valor: 1000, pagamentos: [{ tipo: 'Dinheiro', valor: 1000 }],
    tributos: { pis: '49', cofins: '49', aproximado: null }, observacao: '', interestadual: false,
  },
  notas: [],
  correcao: {
    comprador: {
      clienteNome: 'Comprador de teste', clienteCpf: '35281765043', clienteCep: '37000000',
      clienteLogradouro: 'Rua de teste', clienteNumero: '10', clienteComplemento: null,
      clienteBairro: 'Centro', clienteCidade: '3170701', clienteEstado: 'MG',
      clienteIndicadorIe: '9', clienteInscricaoEstadual: null,
    },
    moto: { ncm: '87116000', cest: '' },
  },
  podeConfigurarFiscal: false, avisoEmissor: null,
}


const unexpectedAction = async () => { throw new Error('Este cenário não deve chamar uma action de gravação ou consulta fiscal.') }
const acoesInesperadas = () => ({
  previsualizarNfePropriaAction: async () => preview as PreviaNfe,
  transmitirNfePropriaAction: unexpectedAction as (...args: unknown[]) => Promise<unknown>,
  corrigirEReenviarNfAction: unexpectedAction as (...args: unknown[]) => Promise<unknown>,
})
let acoes = acoesInesperadas()
// Um só mock de módulo para o arquivo todo; cada teste troca só as ações que espera.
const modulos: { restore(): void }[] = []
before(() => {
  modulos.push(mock.module('../../vendas/nfe-propria-actions', { namedExports: {
    previsualizarNfePropriaAction: (...args: unknown[]) => (acoes.previsualizarNfePropriaAction as (...a: unknown[]) => Promise<PreviaNfe>)(...args),
    transmitirNfePropriaAction: (...args: unknown[]) => acoes.transmitirNfePropriaAction(...args),
    corrigirEReenviarNfAction: (...args: unknown[]) => acoes.corrigirEReenviarNfAction(...args),
    consultarNfePropriaAction: unexpectedAction, salvarFichaMotoAction: unexpectedAction,
    salvarCestMotoAction: unexpectedAction, cancelarNfePropriaAction: unexpectedAction,
    cancelarNfeExtemporaneaAction: unexpectedAction, descartarTentativaAction: unexpectedAction,
  } }))
  modulos.push(mock.module('../../vendas/cartas-correcao-actions', { namedExports: {
    cartasDaNotaAction: unexpectedAction, descartarCartaAction: unexpectedAction,
    emitirCartaCorrecaoAction: unexpectedAction, reconsultarCartasAction: unexpectedAction,
  } }))
})
after(() => modulos.forEach(m => m.restore()))

async function abrirPainel() {
  const { createRoot } = await import('react-dom/client')
  const { NfePropriaPainel } = await import('./nfe-propria-painel')
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(createElement(NfePropriaPainel, { motoId: 'moto-teste', onVoltar: () => {} })))
  const click = async (name: RegExp) => {
    const button = [...container.querySelectorAll('button')].find(element => name.test(element.textContent ?? ''))
    assert.ok(button, `Botão ${name} deve estar disponível`)
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  }
  const escolherFrete = async (valor: string) => {
    const select = container.querySelector<HTMLSelectElement>('select#modalidade-frete')
    assert.ok(select, 'A escolha de frete deve estar na tela')
    await act(async () => {
      select.value = valor
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
  }
  return { container, click, escolherFrete }
}

const modalidade4: DadosTransporte['modalidade'] = 'TransporteProprioPorContaDoDestinatario'
const entregaDoComprador = {
  tipoPessoaDestinatario: 'F', cpfCnpjDestinatario: '35281765043', logradouro: 'Rua de teste', numero: '10',
  bairro: 'Centro', cidade: '3170701', uf: 'MG',
} as const

const recusa478: NotaResumo = {
  id: 'nota-recusada', ambiente: 'Homologacao', status: 'Negada', motivoStatus: '478 - UF de entrega ausente',
  numero: '650', serie: '1', linkDanfe: null, linkXml: null, criadoEm: '2026-11-04T12:00:00.000Z',
  dataAutorizacao: null, cancelamento: null,
}

test('Avançar abre a escolha do frete e exige seleção somente nessa etapa', async () => {
  acoes = { ...acoes, previsualizarNfePropriaAction: async () => preview }
  const { container, click, escolherFrete } = await abrirPainel()
  await click(/^Avançar/)
  await click(/^Avançar/)
  await click(/^Avançar/)

  const select = container.querySelector<HTMLSelectElement>('select#modalidade-frete')
  assert.ok(select, 'O operador deve chegar à escolha de frete sem precisar escolhê-lo antes')
  assert.equal(select.value, '')
  await click(/^Conferir nota$/)
  assert.match(container.textContent ?? '', /Selecione a modalidade do frete\./)
  assert.ok(container.querySelector('select#modalidade-frete'))

  await escolherFrete(modalidade4)
  await click(/^Conferir nota$/)
  assert.equal(container.querySelector('select#modalidade-frete'), null)
  assert.match(container.textContent ?? '', /Ambiente de teste \(homologação\)/)
})

test('o envio inicial leva a modalidade escolhida e a entrega que veio do comprador', async () => {
  const chamadas: unknown[][] = []
  acoes = { ...acoes, previsualizarNfePropriaAction: async () => preview,
    transmitirNfePropriaAction: async (...args: unknown[]) => { chamadas.push(args); return { ok: true } } }
  const { container, click, escolherFrete } = await abrirPainel()
  await click(/^Avançar/); await click(/^Avançar/); await click(/^Avançar/)
  await escolherFrete(modalidade4)
  await click(/^Conferir nota$/)
  const conferi = container.querySelector<HTMLInputElement>('input[type=checkbox]')!
  await act(async () => conferi.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  await click(/Transmitir teste/)

  assert.deepEqual(chamadas, [['moto-teste', RENAVE_COMPLETO_FATURAMENTO_DIRETO, { modalidade: modalidade4, enderecoEntrega: entregaDoComprador }]])
})

test('reabrir a recusa mostra o transporte do envio anterior e o reenvio leva o que o operador deixar', async () => {
  const chamadas: unknown[][] = []
  const anterior: DadosTransporte = { modalidade: modalidade4, enderecoEntrega: { ...entregaDoComprador, logradouro: 'Rua da entrega', uf: 'PR', cidade: '4106902' } }
  acoes = { ...acoes,
    previsualizarNfePropriaAction: async () => ({ ...preview, notas: [recusa478], transporteAnterior: anterior }),
    corrigirEReenviarNfAction: async (...args: unknown[]) => { chamadas.push(args); return { ok: true } } }
  const { container, click, escolherFrete } = await abrirPainel()

  const select = container.querySelector<HTMLSelectElement>('select#modalidade-frete')
  assert.equal(select?.value, modalidade4)
  assert.equal(container.querySelector<HTMLInputElement>('#entrega-logradouro')?.value, 'Rua da entrega')
  await escolherFrete('SemTransporte')
  await click(/^Salvar e reenviar/)

  assert.equal(chamadas.length, 1)
  const [motoId, , renave, transporte] = chamadas[0]
  assert.equal(motoId, 'moto-teste')
  assert.deepEqual(renave, RENAVE_COMPLETO_FATURAMENTO_DIRETO)
  assert.deepEqual(transporte, { ...anterior, modalidade: 'SemTransporte' })
})

test('operação que não é faturamento direto vai da etapa da operação direto para a conferência, sem etapa de frete', async () => {
  acoes = { ...acoes, previsualizarNfePropriaAction: async () => ({ ...preview, renave: { ...RENAVE_COMPLETO_FATURAMENTO_DIRETO, tipoOperacao: 'VendaConcessionaria' } }) }
  const { container, click } = await abrirPainel()
  await click(/^Avançar/); await click(/^Avançar/); await click(/^Avançar/)
  assert.equal(container.querySelector('select#modalidade-frete'), null)
  assert.match(container.textContent ?? '', /Ambiente de teste \(homologação\)/)
  await act(async () => container.querySelector<HTMLInputElement>('input[type=checkbox]')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  const transmitir = [...container.querySelectorAll('button')].find(b => /Transmitir teste/.test(b.textContent ?? ''))
  assert.equal(transmitir?.disabled, false)
})

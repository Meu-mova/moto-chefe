import { test, after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, act } from 'react'
import type { Root } from 'react-dom/client'
import type { PreviaNfe } from '../../vendas/nfe-propria-actions'
import { sugestaoRenave } from '@/lib/notagateway/veiculo'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)
let root: Root | undefined

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  document.body.replaceChildren()
  mock.restoreAll()
})

const preview: Extract<PreviaNfe, { ok: true }> = {
  ok: true, vendaId: 'venda-teste', vendaNumero: 1, ambiente: 'Homologacao',
  jaFaturada: null, pendencias: [],
  ficha: { xProd: 'Ciclomotor de teste', ncm: '87116000', cest: '', unidade: 'UN', origem: '0' },
  sugestao: { xProd: 'Ciclomotor de teste', ncm: '87116000', cest: '', unidade: 'UN', origem: '0' },
  exigeRenave: true,
  renave: {
    ...sugestaoRenave({ chassi: '9C2ABC12345678901', cor: 'Branca', motor: 'TESTE', potenciaW: '1000W', anoAtual: 2026 }),
    tipoOperacao: 'FaturamentoDiretoConsumidorFinal',
  },
  renaveOrigem: {},
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

test('Avançar abre a escolha do frete e exige seleção somente nessa etapa', async () => {
  mock.module('../../vendas/nfe-propria-actions', { namedExports: {
    previsualizarNfePropriaAction: async () => preview,
    transmitirNfePropriaAction: unexpectedAction, corrigirEReenviarNfAction: unexpectedAction,
    consultarNfePropriaAction: unexpectedAction, salvarFichaMotoAction: unexpectedAction,
    salvarCestMotoAction: unexpectedAction, cancelarNfePropriaAction: unexpectedAction,
    cancelarNfeExtemporaneaAction: unexpectedAction, descartarTentativaAction: unexpectedAction,
  } })
  mock.module('../../vendas/cartas-correcao-actions', { namedExports: {
    cartasDaNotaAction: unexpectedAction, descartarCartaAction: unexpectedAction,
    emitirCartaCorrecaoAction: unexpectedAction, reconsultarCartasAction: unexpectedAction,
  } })
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
  await click(/^Avançar/)
  await click(/^Avançar/)
  await click(/^Avançar/)

  const select = container.querySelector<HTMLSelectElement>('select#modalidade-frete')
  assert.ok(select, 'O operador deve chegar à escolha de frete sem precisar escolhê-lo antes')
  assert.equal(select.value, '')
  await click(/^Conferir nota$/)
  assert.match(container.textContent ?? '', /Selecione a modalidade do frete\./)
  assert.ok(container.querySelector('select#modalidade-frete'))

  await act(async () => {
    select.value = 'TransporteProprioPorContaDoDestinatario'
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  })
  await click(/^Conferir nota$/)
  assert.equal(container.querySelector('select#modalidade-frete'), null)
  assert.match(container.textContent ?? '', /Ambiente de teste \(homologação\)/)
})

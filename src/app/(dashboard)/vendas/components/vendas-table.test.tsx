// Em produção, cancelar a NF tira o número da venda e o revalidatePath redesenha
// a tabela. Aqui a tabela é redesenhada com a venda sem o número (ou fora da
// lista), e o diálogo aberto pelo número tem de continuar na tela.
import { JSDOM } from 'jsdom'
import test, { mock } from 'node:test'
import assert from 'node:assert'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import type { NotaResumo } from '../nfe-propria-actions'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
const g = globalThis as Record<string, unknown>
g.window = dom.window; g.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'HTMLButtonElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'NodeList', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  g[k] = (dom.window as unknown as Record<string, unknown>)[k]
}
g.IS_REACT_ACT_ENVIRONMENT = true

const TRES_HORAS_ATRAS = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()

const NOTA: NotaResumo = {
  id: 'nota-1', ambiente: 'Producao', status: 'Autorizada', motivoStatus: null,
  numero: '4512', serie: '1', linkDanfe: null, linkXml: null,
  criadoEm: TRES_HORAS_ATRAS, dataAutorizacao: TRES_HORAS_ATRAS, cancelamento: null,
}

const VENDA = {
  id: 'venda-1', numero: 31601, dataVenda: new Date('2026-10-09T12:00:00Z'), modelo: 'S3 Urban',
  chassi: '9C2KC2200NR001234', cor: 'Preta', lojaNome: 'Varginha', vendedorNome: 'Carlos Lima',
  contratoStatus: 'assinado', checklistStatus: 'assinado', nfLiberadaEm: null, notaFiscalSaida: '4512',
  valor: '12990.00', pagamentos: [], conciliadoValor: 0, pixConciliadoValor: 0, statusConciliacao: 'pendente',
  lojaId: 'loja-1', motoId: 'moto-1', clienteNome: 'Mariana Alves',
} as unknown as VendaComDetalhes

mock.module('next/navigation', { namedExports: { useSearchParams: () => new URLSearchParams() } })
mock.module('../nfe-propria-actions', {
  namedExports: {
    notasDaVendaAction: async () => ({ ok: true, notas: [NOTA] }),
    cancelarNfePropriaAction: async () => ({ ok: false, error: 'não usado no teste' }),
    consultarNfePropriaAction: async () => ({ ok: false, error: 'não usado no teste' }),
  },
})
// Os botões de ação da linha importam server actions com banco; o teste não passa por eles.
const BOTOES_DA_LINHA: [string, string][] = [
  ['../../estoque/components/garantia-button', 'GarantiaButton'],
  ['../../estoque/components/nf-saida-button', 'NfSaidaButton'],
  ['./cancelar-venda-button', 'CancelarVendaButton'],
  ['./detalhes-venda-dialog', 'DetalhesVendaDialog'],
  ['./editar-venda-dialog', 'EditarVendaDialog'],
]
for (const [caminho, nome] of BOTOES_DA_LINHA) mock.module(caminho, { namedExports: { [nome]: () => null } })

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const textoDaTela = () => document.body.textContent ?? ''
const botaoDaNf = () => [...document.querySelectorAll('button')].find(b => b.textContent === '4512')

async function montarTabela(papel: string) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { VendasTable } = await import('./vendas-table')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const desenhar = (vendas: VendaComDetalhes[]) => act(async () => {
    root.render(React.createElement(VendasTable, { vendas, papel, vendedores: [], origens: [] }))
  })
  const abrirNf = async () => {
    await act(async () => { botaoDaNf()!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    await act(async () => { await esperar(50) })
  }
  const desmontar = () => act(async () => { root.unmount() })
  return { desenhar, abrirNf, desmontar, act }
}

test('o diálogo aberto pelo número da NF continua na tela quando a venda perde o número', async () => {
  const t = await montarTabela('aux_adm')
  await t.desenhar([VENDA])
  assert.ok(botaoDaNf(), 'para o aux_adm, o número da NF é um botão')
  await t.abrirNf()
  assert.ok(textoDaTela().includes('NF de saída 4512'), 'o diálogo abre')
  assert.ok(textoDaTela().includes('NF 4512 · série 1'), 'com a nota da venda')

  await t.desenhar([{ ...VENDA, notaFiscalSaida: null }])
  await t.act(async () => { await esperar(300) })
  assert.ok(textoDaTela().includes('NF de saída 4512'), 'o diálogo continua na tela')
  await t.desmontar()
})

test('o diálogo continua na tela quando a venda sai da lista', async () => {
  const t = await montarTabela('admin_socio')
  await t.desenhar([VENDA])
  await t.abrirNf()
  await t.desenhar([])
  await t.act(async () => { await esperar(300) })
  assert.ok(textoDaTela().includes('NF de saída 4512'))
  await t.desmontar()
})

test('para o vendedor, o número da NF aparece sem botão', async () => {
  const t = await montarTabela('vendedor')
  await t.desenhar([VENDA])
  assert.equal(botaoDaNf(), undefined)
  assert.ok(textoDaTela().includes('4512'))
  await t.desmontar()
})

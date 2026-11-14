// Card de Aprovações pendentes (#876): o pedido "Abaixo do mínimo" mostra o quadro Mínimo, Venda e
// Líquido, com quanto cada um ficou abaixo do mínimo; sem snapshot, o card fica como antes.
import { createElement, type ReactNode } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { AprovacaoPendente } from '@/lib/queries/motos'
import { montarDom } from '@/test/montar-dom'

const { desmontar } = montarDom()
after(desmontar)

// O Link de verdade agenda prefetch com `self`, que o JSDOM do teste não tem.
mock.module('next/link', { defaultExport: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children) })
mock.module('../actions', {
  namedExports: {
    aprovarVendaAction: async () => ({ ok: true }),
    recusarVendaAction: async () => ({ ok: true }),
  },
})

// O exemplo da issue: mínimo 10.000, venda de 9.950 em 12x, líquido 9.111,72 depois da taxa.
const ABAIXO_DO_MINIMO = {
  id: 'apr-1', origem: 'moto', motoId: 'moto-1', osId: null, lojaId: 'loja-1',
  valor: '9950.00', motivo: 'cliente pediu', tipo: 'valor_minimo',
  dadosVenda: { pagamentos: [{ tipo: 'cartao_credito', valor: 9950, parcelas: 12 }] },
  dataSolicitacao: new Date('2026-11-13T18:40:00Z'), vendedorNome: 'Vendedor Exemplo', lojaNome: 'Loja Exemplo',
  chassi: 'CHASSI1', cor: 'CINZA', marca: 'MOTOCHEFE', modelo: 'JETMAX', osNumero: null, osClienteNome: null,
  valorMinimoSnapshot: '10000.00', liquidoSnapshot: '9111.72', snapshotEstimado: false,
} as unknown as AprovacaoPendente

// O toLocaleString põe espaço não separável depois do "R$".
const texto = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const itemDoQuadro = (rotulo: string) =>
  [...document.querySelectorAll('dt')].find(dt => texto(dt) === rotulo)?.parentElement
// Rótulo, valor e diferença do item, separados por espaço (no DOM eles vêm colados).
const textoDoItem = (rotulo: string) => [...(itemDoQuadro(rotulo)?.children ?? [])].map(texto).join(' ')
const textoDaTela = () => texto(document.body)

let desmontarPainel: (() => Promise<void>) | null = null
afterEach(async () => {
  await desmontarPainel?.()
  desmontarPainel = null
  document.body.innerHTML = ''
})

async function desenhar(aprovacao: AprovacaoPendente) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { AprovacoesPendentesPanel } = await import('./aprovacoes-pendentes-panel')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(AprovacoesPendentesPanel, {
      aprovacoes: [aprovacao], podeAprovarValorMinimo: true, podeAprovarSensivel: true,
    }))
  })
  desmontarPainel = () => act(async () => { root.unmount() })
}

test('abaixo do mínimo: o quadro mostra mínimo, venda e líquido com quanto cada um ficou abaixo', async () => {
  await desenhar(ABAIXO_DO_MINIMO)
  assert.equal(textoDoItem('Mínimo'), 'Mínimo R$ 10.000,00')
  assert.equal(textoDoItem('Venda'), 'Venda R$ 9.950,00 R$ 50,00 abaixo')
  assert.equal(textoDoItem('Líquido (12x)'), 'Líquido (12x) R$ 9.111,72 R$ 888,28 abaixo')
})

test('sem snapshot: nenhum quadro, o valor da venda continua no card', async () => {
  await desenhar({ ...ABAIXO_DO_MINIMO, valorMinimoSnapshot: null, liquidoSnapshot: null })
  assert.equal(itemDoQuadro('Mínimo'), undefined)
  assert.ok(textoDaTela().includes('R$ 9.950,00'))
  assert.ok(!textoDaTela().includes('abaixo'))
})

test('venda no mínimo e líquido abaixo: a Venda fica sem diferença, nada de "R$ 0,00 abaixo"', async () => {
  await desenhar({ ...ABAIXO_DO_MINIMO, valor: '10000.00', liquidoSnapshot: '9156.59' })
  assert.equal(textoDoItem('Venda'), 'Venda R$ 10.000,00')
  assert.equal(textoDoItem('Líquido (12x)'), 'Líquido (12x) R$ 9.156,59 R$ 843,41 abaixo')
  assert.ok(!textoDaTela().includes('R$ 0,00'))
})

test('financiamento ou transferência: o card não ganha quadro', async () => {
  await desenhar({ ...ABAIXO_DO_MINIMO, tipo: 'pagamento_sensivel', valorMinimoSnapshot: null, liquidoSnapshot: null })
  assert.equal(itemDoQuadro('Mínimo'), undefined)
  assert.ok(textoDaTela().includes('Financiamento/Transferência'))
})

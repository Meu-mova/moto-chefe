// Na produção, a nota autorizada fatura a venda e o revalidatePath redesenha o
// Showroom com a moto 'vendida': a linha sai do ramo "aguardando NF". Aqui a tabela é
// redesenhada assim, e o diálogo da NF aberto tem de continuar o mesmo.
import { JSDOM } from 'jsdom'
import { createElement, useState } from 'react'
import test, { mock } from 'node:test'
import assert from 'node:assert'
import type { MotoComDetalhes } from '@/lib/queries/motos'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
const g = globalThis as Record<string, unknown>
g.window = dom.window; g.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'HTMLButtonElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'NodeList', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  g[k] = (dom.window as unknown as Record<string, unknown>)[k]
}
g.IS_REACT_ACT_ENVIRONMENT = true

// O Link do Next precisa do roteador; para o teste basta um <a>.
mock.module('next/link', { defaultExport: ({ href, children }: { href: string; children: React.ReactNode }) => createElement('a', { href }, children) })
// Os outros botões da linha importam server actions com banco; o teste não passa por eles.
for (const [caminho, nome] of [
  ['./vender-button', 'VenderButton'], ['./garantia-button', 'GarantiaButton'], ['./logistica-button', 'LogisticaButton'],
  ['./montar-button', 'MontarButton'], ['./cancelar-reserva-button', 'CancelarReservaButton'],
]) mock.module(caminho, { namedExports: { [nome]: () => null } })
// Como o diálogo real: o que mostra fica no useState; desmontar perde.
mock.module('./nf-saida-button', {
  namedExports: {
    NfSaidaButton: function NfSaidaButton({ semBotao }: { semBotao?: boolean }) {
      const [tela, setTela] = useState('fechado')
      return createElement('div', null,
        semBotao ? null : createElement('button', { 'data-nf': '', onClick: () => setTela('NF-e 440 autorizada') }, 'NF Saída'),
        createElement('output', { 'data-tela': '' }, tela))
    },
  },
})

const MOTO = {
  id: 'moto-1', modeloId: 'modelo-1', modelo: 'X11-12', chassi: 'LXYTCK0000000013', cor: 'BEGE',
  lojaId: 'loja-1', lojaNome: 'Centro', status: 'vendida', disponibilidade: null, blingNfeId: null,
} as unknown as MotoComDetalhes

test('o diálogo da NF aberto continua quando a moto passa a vendida (faturamento na produção)', async () => {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { MotoTable } = await import('./moto-table')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const desenhar = (motos: MotoComDetalhes[]) => act(async () => {
    root.render(React.createElement(MotoTable, {
      motos, demandasComSinal: [], papel: 'admin_socio', vendedorId: 'u1', vendedorNome: 'Sócio', usuarios: [], mecanicos: [],
      lojas: [], lojaUsuarioId: null, podeAprovarPagamentoSensivel: false, ord: 'modelo', dir: 'asc', baseParams: '', origens: [],
    }))
  })
  const tela = () => document.querySelector('[data-tela]')?.textContent

  await desenhar([MOTO])
  await act(async () => { document.querySelector('[data-nf]')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  assert.equal(tela(), 'NF-e 440 autorizada')

  await desenhar([{ ...MOTO, disponibilidade: 'vendida' } as MotoComDetalhes])
  assert.equal(tela(), 'NF-e 440 autorizada', 'o mesmo diálogo, sem desmontar')
  assert.equal(document.querySelector('[data-nf]'), null, 'e a linha já não oferece NF Saída')
  await act(async () => { root.unmount() })
})

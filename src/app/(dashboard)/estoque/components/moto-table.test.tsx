// Na produção, a nota autorizada fatura a venda e o revalidatePath redesenha o
// Showroom sem a moto, que passou a vendida e o filtro padrão esconde. Aqui a tabela é
// redesenhada assim, e o diálogo da NF aberto tem de continuar o mesmo (nf-saida-contexto).
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
// Como o diálogo real: o estado vive no useState; desmontar perde. Conta as montagens para
// separar "continuou" de "desmontou e montou de novo", e o Fechar chama o onFechado.
let montagens = 0
mock.module('./nf-saida-button', {
  namedExports: {
    NfSaidaGatilho: ({ onClick }: { onClick: () => void }) => createElement('button', { 'data-nf': '', onClick }, 'NF Saída'),
    NfSaidaButton: function NfSaidaButton({ motoId, onFechado }: { motoId: string; onFechado?: () => void }) {
      const [n] = useState(() => ++montagens)
      return createElement('div', { 'data-dialogo': motoId },
        createElement('output', { 'data-montagem': '' }, String(n)),
        createElement('button', { 'data-fechar': '', onClick: () => onFechado?.() }, 'Fechar'))
    },
  },
})

const MOTO = {
  id: 'moto-1', modeloId: 'modelo-1', modelo: 'X11-12', chassi: 'LXYTCK0000000013', cor: 'BEGE',
  lojaId: 'loja-1', lojaNome: 'Centro', status: 'vendida', disponibilidade: null, blingNfeId: null,
} as unknown as MotoComDetalhes

async function montar() {
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
  const clicar = (sel: string) => act(async () => { document.querySelector(sel)!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  const montagem = () => document.querySelector('[data-montagem]')?.textContent ?? null
  return { desenhar, clicar, montagem, desmontar: () => act(async () => { root.unmount() }) }
}

test('o diálogo da NF continua (sem remontar) quando a moto vendida sai da lista', async () => {
  montagens = 0
  const t = await montar()
  await t.desenhar([MOTO])
  await t.clicar('[data-nf]')
  assert.equal(t.montagem(), '1')

  // O Showroom padrão esconde a moto vendida: ela sai da lista.
  await t.desenhar([])
  assert.equal(t.montagem(), '1', 'o mesmo diálogo: não desmontou nem montou de novo')
  assert.equal(document.querySelector('[data-nf]'), null, 'e a linha já não está na tela')
  await t.desmontar()
})

test('ao fechar, o diálogo sai; abrir de novo monta um novo', async () => {
  montagens = 0
  const t = await montar()
  await t.desenhar([MOTO])
  await t.clicar('[data-nf]')
  await t.clicar('[data-fechar]')
  assert.equal(document.querySelector('[data-dialogo]'), null, 'onFechado limpa a moto aberta')
  await t.clicar('[data-nf]')
  assert.equal(t.montagem(), '2')
  await t.desmontar()
})

test('a tabela é Server Component: as demandas (com dados de cliente) não vão inteiras ao navegador', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const dir = join(process.cwd(), 'src/app/(dashboard)/estoque/components')
  const tabela = readFileSync(join(dir, 'moto-table.tsx'), 'utf8')
  assert.doesNotMatch(tabela, /^\s*['"]use client['"]/, 'moto-table.tsx sem use client')
  // O pedaço client do diálogo só recebe a moto aberta: nem demandas nem a lista de motos.
  const contexto = readFileSync(join(dir, 'nf-saida-contexto.tsx'), 'utf8')
  assert.match(contexto, /export function NfSaidaProvider\(\{ children \}: \{ children: React\.ReactNode \}\)/)
  assert.match(contexto, /type MotoDaNf = \{ motoId: string; descricao: string; blingNfeId: string \| null \}/)
})

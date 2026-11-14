import { before, test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LojaPainel, VendaPainel } from '@/lib/painel-fabrica'

mock.module('next/link', { defaultExport: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children) })
type Tabelas = typeof import('./tabelas-painel')
let TabelaEstoque: Tabelas['TabelaEstoque']
let TabelaVendas: Tabelas['TabelaVendas']
before(async () => { ({ TabelaEstoque, TabelaVendas } = await import('./tabelas-painel')) })

const lojas: LojaPainel[] = [{ lojaId: 'loja-a', lojaNome: 'Loja Centro' }, { lojaId: 'loja-b', lojaNome: 'Loja Norte' }]
const vendas: VendaPainel[] = [
  { numero: 201, data: '2026-11-01T01:30:00.000Z', lojaId: 'loja-b', modelo: 'X12', cor: 'PRETO', chassi: 'CHASSI201' },
  { numero: 101, data: '2026-10-02T15:00:00.000Z', lojaId: 'loja-a', modelo: 'JETMAX', cor: 'AZUL', chassi: 'CHASSI101' },
]
const filtro = { lojas: [], modelos: [], cores: [] }
const props = { lojas, periodo: '01/10/2026 a 31/10/2026', filtro, de: '2026-10-01', ate: '2026-10-31' }
const TRAVESSAO = '\u2014'

test('vendas: cada venda numa linha com data e hora de Brasília, número, loja, modelo, cor e chassi', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas }))
  // 01:30 UTC de 01/11 é 22h30 de 31/10 em Brasília.
  for (const t of ['31/10/2026 22:30', '>201<', 'Loja Norte', 'CHASSI201', '02/10/2026 12:00', 'CHASSI101', 'AZUL']) assert.ok(html.includes(t), t)
})

test('vendas: a loja leva ao filtro só dela, na aba de vendas, mantendo o período', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas }))
  assert.ok(html.includes('href="/admin/painel-fabrica?aba=vendas&amp;de=2026-10-01&amp;ate=2026-10-31&amp;loja=loja-b"'))
})

test('vendas: no impresso a loja não vira link', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas, impresso: true }))
  assert.ok(!html.includes('<a '))
})

test('vendas: célula zerada da matriz mostra 0, sem travessão', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas }))
  assert.ok(!html.includes(TRAVESSAO))
  // Loja Centro não vendeu X12 e Loja Norte não vendeu JETMAX: as duas células zeradas aparecem com 0.
  assert.equal(html.match(/text-muted-foreground">0<\/td>/g)?.length, 2)
})

test('vazio: nem vendas nem estoque mostram travessão', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas: [] }))
    + renderToStaticMarkup(createElement(TabelaEstoque, { lojas, estoque: [] }))
  assert.ok(!html.includes(TRAVESSAO))
  assert.ok(html.includes('Nenhuma venda no período com estes filtros.'))
  assert.ok(html.includes('Nenhuma loja com estoque com estes filtros.'))
})

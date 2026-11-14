import { after, before, test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { COLUNAS_VENDAS, celulasDaVenda, nomeDaLoja, type LinhaEstoquePainel, type LojaPainel, type VendaPainel } from '@/lib/painel-fabrica'

const link = mock.module('next/link', { defaultExport: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children) })
after(() => link.restore())
type Tabelas = typeof import('./tabelas-painel')
let TabelaEstoque: Tabelas['TabelaEstoque']
let TabelaVendas: Tabelas['TabelaVendas']
before(async () => { ({ TabelaEstoque, TabelaVendas } = await import('./tabelas-painel')) })

const lojas: LojaPainel[] = [{ lojaId: 'loja-a', lojaNome: 'Loja Centro' }, { lojaId: 'loja-b', lojaNome: 'Loja Norte' }]
const vendas: VendaPainel[] = [
  { numero: 201, data: '2026-11-01T01:30:00.000Z', lojaId: 'loja-b', modelo: 'X12', cor: 'PRETO', chassi: 'CHASSI201' },
  { numero: 101, data: '2026-10-02T15:00:00.000Z', lojaId: 'loja-a', modelo: 'JETMAX', cor: 'AZUL', chassi: 'CHASSI101' },
]
const estoque: LinhaEstoquePainel[] = [
  { lojaId: 'loja-a', modelo: 'X12', cor: 'PRETO', quantidade: 3 },
  { lojaId: 'loja-b', modelo: 'X12', cor: 'BRANCO', quantidade: 1 },
]
const filtro = { lojas: [], modelos: [], cores: [] }
const props = { lojas, periodo: '01/10/2026 a 31/10/2026', filtro, de: '2026-10-01', ate: '2026-10-31' }
const TRAVESSAO = '—'

/** Texto que a pessoa lê: o HTML sem as tags (o id da loja pode estar só no href). */
const textoVisivel = (html: string) => html.replace(/<[^>]*>/g, ' ')
/** Textos das células de cada linha (`<tr>`) da tabela, sem as tags. */
const linhas = (html: string) =>
  [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(tr => [...tr[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g)].map(c => textoVisivel(c[1]).trim()))
const linhaQueComecaCom = (html: string, inicio: string) => linhas(html).find(l => l[0] === inicio)

test('vendas: cada venda numa linha com data e hora de Brasília, número, loja, modelo, cor e chassi', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas }))
  // 01:30 UTC de 01/11 é 22h30 de 31/10 em Brasília.
  assert.deepEqual(linhaQueComecaCom(html, '31/10/2026 22:30'), ['31/10/2026 22:30', '201', 'Loja Norte', 'X12', 'PRETO', 'CHASSI201'])
  assert.deepEqual(linhaQueComecaCom(html, '02/10/2026 12:00'), ['02/10/2026 12:00', '101', 'Loja Centro', 'JETMAX', 'AZUL', 'CHASSI101'])
})

test('vendas: a lista tem as colunas da planilha, na mesma ordem', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas }))
  assert.ok(linhas(html).some(l => l.join('|') === COLUNAS_VENDAS.join('|')))
})

test('vendas: a linha da tela tem as mesmas células da planilha', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas }))
  for (const v of vendas) {
    const celulas = celulasDaVenda(v, nomeDaLoja(lojas)).map(String)
    assert.deepEqual(linhaQueComecaCom(html, celulas[0]), celulas)
  }
})

test('vendas: a loja leva ao filtro só dela, na aba de vendas, mantendo modelo, cor e período', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas, filtro: { lojas: ['loja-a'], modelos: ['X12'], cores: ['PRETO'] } }))
  assert.ok(html.includes('href="/admin/painel-fabrica?aba=vendas&amp;de=2026-10-01&amp;ate=2026-10-31&amp;loja=loja-b&amp;modelo=X12&amp;cor=PRETO"'))
})

test('vendas: no impresso a loja não vira link', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas, impresso: true }))
  assert.ok(!html.includes('<a '))
})

test('vendas: célula zerada da matriz mostra 0, sem travessão', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas }))
  assert.ok(!html.includes(TRAVESSAO))
  // Colunas da matriz: JETMAX, X12, Total. Loja Centro vendeu 1 JETMAX e nenhuma X12.
  const matriz = linhas(html).filter(l => l.length === 4)
  assert.deepEqual(matriz.find(l => l[0] === 'Loja Centro'), ['Loja Centro', '1', '0', '1'])
  assert.deepEqual(matriz.find(l => l[0] === 'Loja Norte'), ['Loja Norte', '0', '1', '1'])
})

test('vazio: nem vendas nem estoque mostram travessão', () => {
  const html = renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas: [] }))
    + renderToStaticMarkup(createElement(TabelaEstoque, { lojas, estoque: [] }))
  assert.ok(!html.includes(TRAVESSAO))
  assert.ok(html.includes('Nenhuma venda no período com estes filtros.'))
  assert.ok(html.includes('Nenhuma loja com estoque com estes filtros.'))
})

test('estoque: a tabela por loja mostra só o nome da loja e a quantidade', () => {
  const html = renderToStaticMarkup(createElement(TabelaEstoque, { lojas, estoque }))
  assert.deepEqual(linhaQueComecaCom(html, 'Loja Centro'), ['Loja Centro', '3'])
  assert.deepEqual(linhaQueComecaCom(html, 'Loja Norte'), ['Loja Norte', '1'])
})

test('o id da loja não aparece como texto em nenhuma tabela', () => {
  const texto = textoVisivel(renderToStaticMarkup(createElement(TabelaVendas, { ...props, vendas }))
    + renderToStaticMarkup(createElement(TabelaEstoque, { lojas, estoque })))
  assert.ok(!texto.includes('loja-a'))
  assert.ok(!texto.includes('loja-b'))
})

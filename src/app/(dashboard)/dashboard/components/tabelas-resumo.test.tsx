import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TabelaGarantiasVencendo, TabelaOsAbertas, TabelaRankingVendedores, TabelaUltimasVendas } from './tabelas-resumo'

const ocorrencias = (html: string, texto: string) => html.split(texto).length - 1

test('últimas vendas: chassi, loja e vendedor aparecem na coluna e na linha de detalhe', () => {
  const html = renderToStaticMarkup(createElement(TabelaUltimasVendas, { vendas: [
    { id: 'v1', clienteNome: 'C', valor: '9990', dataVenda: new Date('2026-11-01T01:30:00Z'), loja: 'Loja Centro', modelo: 'JET', chassi: 'CH123', vendedor: 'Ana' },
  ] }))
  // A coluna e o detalhe estão os dois no HTML; qual aparece em cada largura é CSS.
  for (const t of ['CH123', 'Loja Centro', 'Ana']) assert.equal(ocorrencias(html, t), 2, t)
  // 22h30 de 31/10 em Brasília: a data é a de Brasília, não a de UTC.
  assert.ok(html.includes('31/10/2026'))
})

test('garantia: a data de vencimento (date puro) sai sem voltar um dia', () => {
  const html = renderToStaticMarkup(createElement(TabelaGarantiasVencendo, { garantias: [
    { id: 'g1', chassi: 'CH9', modelo: 'BOB', loja: 'L', dataFim: '2026-12-01', descricao: 'Bateria' },
  ] }))
  assert.ok(html.includes('01/12/2026'))
  assert.equal(ocorrencias(html, 'Bateria'), 2)
})

test('OS: rótulo do status e chassi no detalhe', () => {
  const html = renderToStaticMarkup(createElement(TabelaOsAbertas, { ordens: [
    { id: 'o1', chassi: 'CH7', modelo: 'GIGA', loja: 'L', status: 'em_andamento', descricao: '', dataAbertura: new Date('2026-10-20T15:00:00Z') },
  ] }))
  assert.ok(html.includes('Em andamento'))
  assert.equal(ocorrencias(html, 'CH7'), 2)
})

test('ranking: sem medalha em emoji; o vendedor logado marcado como "(você)"', () => {
  const html = renderToStaticMarkup(createElement(TabelaRankingVendedores, {
    ranking: [{ vendedorId: 'a', nome: 'Ana', loja: 'L', totalVendas: 3, faturamento: '30000' }, { vendedorId: 'b', nome: 'Bia', loja: 'L', totalVendas: 1, faturamento: '9000' }],
    vendedorAtualId: 'b',
  }))
  assert.ok(!/🥇|🥈|🥉/.test(html))
  assert.ok(html.includes('Bia (você)'))
})

test('ranking: o detalhe do celular traz o que as colunas de desconto mostram', () => {
  const html = renderToStaticMarkup(createElement(TabelaRankingVendedores, {
    ranking: [{ vendedorId: 'a', nome: 'Ana', loja: 'L', totalVendas: 3, faturamento: '100000' }],
    descontos: { porVendedor: new Map([['a', { qtd: 2, margem: 800, preco: 500, estimados: 0 }]]), periodoSemRegistro: false },
  }))
  // O R$ vem com espaço sem quebra (toLocaleString); normalizado para comparar.
  const texto = html.replace(/\u00a0/g, ' ')
  // Quantidade de vendas com desconto e os dois percentuais, também no detalhe.
  assert.ok(texto.includes('desconto na margem R$ 800,00 (2 vendas · 0.8%)'), texto)
  assert.ok(texto.includes('no preço R$ 500,00 (0.5%)'))
})

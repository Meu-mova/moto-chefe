import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharPergunta, porId, CATALOGO } from './perguntas-prontas.ts'

test('roteamento das 9', () => {
  assert.equal(acharPergunta('quantas vendas hoje?')?.id, 'vendas_hoje')
  assert.equal(acharPergunta('vendas no mês')?.id, 'vendas_mes')
  assert.equal(acharPergunta('vendas por vendedor')?.id, 'vendas_por_vendedor')
  assert.equal(acharPergunta('vendas por loja')?.id, 'vendas_por_loja')
  assert.equal(acharPergunta('vendas por modelo')?.id, 'vendas_por_modelo')
  assert.equal(acharPergunta('ranking de vendedores')?.id, 'ranking_vendedores')
  assert.equal(acharPergunta('ranking de motos vendidas')?.id, 'ranking_motos')
  assert.equal(acharPergunta('ranking de lojas')?.id, 'ranking_lojas')
  assert.equal(acharPergunta('estoque por modelo')?.id, 'estoque_por_modelo')
})

test('fora do catálogo não casa (cai no Claude)', () => {
  assert.equal(acharPergunta('qual a previsão do tempo?'), undefined)
})

test('porId acha e todas têm SELECT sem ;', () => {
  assert.equal(porId('vendas_hoje')?.id, 'vendas_hoje')
  for (const p of CATALOGO) {
    assert.match(p.sql.trim(), /^select/i)
    assert.ok(!p.sql.includes(';'))
  }
})

test('formatação em R$ e contagem', () => {
  const hoje = porId('vendas_hoje')!
  const txt = hoje.formatar([{ qtd: 6, total: '48000.00' }])
  assert.match(txt, /6/)
  assert.match(txt, /R\$/)

  const rank = porId('ranking_vendedores')!
  const t2 = rank.formatar([
    { vendedor: 'Ana', qtd: 4, total: '40000' },
    { vendedor: 'Beto', qtd: 2, total: '20000' },
  ])
  assert.match(t2, /1\..*Ana/)
  assert.match(t2, /2\..*Beto/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarPainel, variacao, type EntradaPainel } from './dashboard-painel'

const kpis = { totalVendas: 9, faturamento: 101931, estoque: 4, valorEstoque: 0, transferenciasPendentes: 0, garantiasAtivas: 0, osAbertas: 7 }
const kpisAnt = { ...kpis, totalVendas: 3, faturamento: 29980 }
const base: EntradaPainel = {
  kpis, kpisAnt, papel: 'admin_socio', isVendedor: false, motoMaisVendida: { modelo: 'JET', total: 2 },
  conciliacaoPendentes: 0, faturamentoOS: { servicos: 0, pecas: 0 }, faixasOTE: [],
  descontos: { qtd: 1, margem: 500, preco: 0, estimados: 0 } as EntradaPainel['descontos'],
}
const rotulos = (p: ReturnType<typeof montarPainel>) => ({ manchete: p.manchete.map(m => m.rotulo), indicadores: p.indicadores.map(i => i.rotulo) })

test('admin: os mesmos números de antes, com ticket médio na manchete', () => {
  assert.deepEqual(rotulos(montarPainel(base)), {
    manchete: ['Faturamento', 'Motos vendidas', 'Ticket médio'],
    indicadores: ['Showroom', 'Valor em showroom', 'Transferências pendentes', 'Garantias ativas', 'OS abertas', 'OS · serviços', 'OS · peças', 'Conciliação cartão', 'Descontos'],
  })
})

test('aux_adm (não admin) não vê valor do showroom nem conciliação', () => {
  const r = rotulos(montarPainel({ ...base, papel: 'aux_adm' }))
  assert.ok(!r.indicadores.includes('Valor em showroom'))
  assert.ok(!r.indicadores.includes('Conciliação cartão'))
})

test('vendedor: comissão e premiação na manchete, como os cards de hoje', () => {
  assert.deepEqual(rotulos(montarPainel({ ...base, papel: 'vendedor', isVendedor: true })), {
    manchete: ['Total de vendas', 'Motos vendidas', 'Comissão'],
    indicadores: ['Mais vendida', 'Premiação OTE', 'Descontos'],
  })
})

test('conciliação com pendência vira alerta e leva à tela', () => {
  const c = montarPainel({ ...base, conciliacaoPendentes: 3 }).indicadores.find(i => i.rotulo === 'Conciliação cartão')!
  assert.deepEqual([c.valor, c.alerta, c.href], ['3 pendentes', true, '/conciliacao'])
  const ok = montarPainel(base).indicadores.find(i => i.rotulo === 'Conciliação cartão')!
  assert.deepEqual([ok.valor, ok.alerta], ['Em dia', false])
})

test('ticket médio é faturamento ÷ motos, e zero sem vendas', () => {
  const t = montarPainel(base).manchete[2]
  assert.equal(t.valor, 'R$ 11.325,67')
  assert.equal(montarPainel({ ...base, kpis: { ...kpis, totalVendas: 0, faturamento: 0 } }).manchete[2].valor, 'R$ 0,00')
})

test('variação contra o período anterior', () => {
  assert.deepEqual(variacao(9, 3), { sentido: 'alta', texto: '+200%' })
  assert.deepEqual(variacao(2, 4), { sentido: 'baixa', texto: '-50%' })
  assert.deepEqual(variacao(5, 0), { sentido: 'alta', texto: 'novo' })
  assert.equal(variacao(0, 0), null)
})

test('vendedor: comissão a 0,5% do faturamento e premiação pela faixa, com a variação', () => {
  const p = montarPainel({ ...base, papel: 'vendedor', isVendedor: true, faixasOTE: [{ valorMinimoVendas: '50000', premiacao: '300' }] })
  assert.equal(p.manchete[2].valor, 'R$ 509,66')
  const premiacao = p.indicadores.find(i => i.rotulo === 'Premiação OTE')!
  assert.equal(premiacao.valor, 'R$ 300,00')
  assert.equal(premiacao.dica, 'novo · R$ 0,00 no período anterior')
})

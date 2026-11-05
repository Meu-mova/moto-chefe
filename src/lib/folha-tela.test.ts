import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ABAS_FOLHA, avisoDaAba, descreverRegra, diferencaValorReal, fmtPercentual, hrefComFiltro, mesAdjacente, rotuloMes, situacaoValorReal } from './folha-tela'

test('mesAdjacente: vira o ano em dezembro e em janeiro', () => {
  assert.equal(mesAdjacente('2026-12', 1), '2027-01')
  assert.equal(mesAdjacente('2026-01', -1), '2025-12')
  assert.equal(mesAdjacente('2026-10', 1), '2026-11')
  assert.equal(mesAdjacente('2026-10', -1), '2026-09')
})

test('rotuloMes: mês por extenso, sem virar o dia pelo fuso', () => {
  assert.equal(rotuloMes('2026-10'), 'outubro de 2026')
  assert.equal(rotuloMes('2026-01'), 'janeiro de 2026')
})

test('hrefComFiltro: trocar o mês mantém a loja e os outros filtros', () => {
  assert.equal(hrefComFiltro('/folha-pagamento', 'loja=L1&mes=2026-10', 'mes', '2026-11'), '/folha-pagamento?loja=L1&mes=2026-11')
})

test('hrefComFiltro: trocar a loja mantém o mês; valor vazio tira o filtro', () => {
  assert.equal(hrefComFiltro('/folha-pagamento', 'mes=2026-10', 'loja', 'L2'), '/folha-pagamento?mes=2026-10&loja=L2')
  assert.equal(hrefComFiltro('/folha-pagamento', 'loja=L1&mes=2026-10', 'loja', ''), '/folha-pagamento?mes=2026-10')
  assert.equal(hrefComFiltro('/folha-pagamento', 'loja=L1', 'loja', ''), '/folha-pagamento')
})

test('avisoDaAba: sem aviso nas abas que seguem loja e mês; aviso nas demais', () => {
  assert.equal(avisoDaAba('mes'), null)
  assert.equal(avisoDaAba('holerites'), null)
  assert.match(avisoDaAba('funcionarios') ?? '', /O mês não muda esta aba/)
  assert.match(avisoDaAba('premiacao') ?? '', /os filtros de loja e de mês não mudam esta aba/)
  assert.equal(avisoDaAba('comissoes'), 'Mostra as regras de todas as lojas do grupo; o mês só define quais estão vigentes.')
  for (const id of ['adiantamentos', 'ajustes']) {
    assert.match(avisoDaAba(id) ?? '', /o filtro de loja não muda esta aba\. Segue o mês escolhido/, id)
  }
})

test('ABAS_FOLHA: as 7 abas na ordem da tela, só a Folha do Mês imprime', () => {
  assert.deepEqual(ABAS_FOLHA.map(a => a.id), ['mes', 'funcionarios', 'comissoes', 'premiacao', 'adiantamentos', 'holerites', 'ajustes'])
  assert.deepEqual(ABAS_FOLHA.filter(a => a.imprime).map(a => a.id), ['mes'])
})

test('mesAdjacente: mês inválido na URL cai no mês de referência, sem NaN', () => {
  assert.equal(mesAdjacente('abc', 1, '2026-11'), '2026-12')
  assert.equal(mesAdjacente('2026-13', -1, '2026-11'), '2026-10')
  assert.equal(mesAdjacente('', 1, '2026-12'), '2027-01')
})

test('a página tem um painel para cada aba de ABAS_FOLHA, na mesma ordem', () => {
  const pagina = readFileSync('src/app/(dashboard)/folha-pagamento/page.tsx', 'utf8')
  const paineis = [...pagina.matchAll(/<TabsContent value="([^"]+)"/g)].map(m => m[1])
  // Renomear uma aba num lado só deixaria o painel nunca mostrado, sem erro.
  assert.deepEqual(paineis, ABAS_FOLHA.map(a => a.id))
})

// O espaço entre "R$" e o número é o não separável (U+00A0) que o toLocaleString põe.
test('diferencaValorReal: sem valor real não há diferença; centavo de arredondamento é zero', () => {
  assert.equal(diferencaValorReal(null, 4180.4), null)
  assert.equal(diferencaValorReal(4180.4, 4180.4), 0)
  assert.equal(diferencaValorReal(4180.404, 4180.4), 0)
  assert.equal(diferencaValorReal(2400, 2384), 16)
  assert.equal(diferencaValorReal(2380, 2384), -4)
})

test('situacaoValorReal: o texto da linha no celular', () => {
  assert.deepEqual(situacaoValorReal(null, 3165), { tipo: 'sem', texto: 'Sem valor real' })
  assert.deepEqual(situacaoValorReal(4180.4, 4180.4), { tipo: 'confere', texto: 'Real confere' })
  assert.deepEqual(situacaoValorReal(4180.404, 4180.4), { tipo: 'confere', texto: 'Real confere' })
  assert.deepEqual(situacaoValorReal(2400, 2384), { tipo: 'diverge', texto: 'Real +R$\u00a016,00' })
  assert.deepEqual(situacaoValorReal(2380, 2384), { tipo: 'diverge', texto: 'Real -R$\u00a04,00' })
})

test('descreverRegra: percentual, base em minúsculas e o valor sobre o qual incidiu', () => {
  const regra = { percentual: 1, base: 'proprias_motos', valorBase: 183040 }
  assert.equal(descreverRegra(regra), '1% motos vendidas por ele · R$\u00a0183.040,00')
  assert.equal(descreverRegra({ ...regra, percentual: 0.05, valorBase: 200000 }), '0,05% motos vendidas por ele · R$\u00a0200.000,00')
})

test('fmtPercentual: o numeric do banco em pt-BR, de 1 a 3 casas', () => {
  assert.equal(fmtPercentual('0.30'), '0,3')
  assert.equal(fmtPercentual('0.05'), '0,05')
  assert.equal(fmtPercentual('1.00'), '1,0')
  assert.equal(fmtPercentual('12.5'), '12,5')
  assert.equal(fmtPercentual('0.0010'), '0,001')
})

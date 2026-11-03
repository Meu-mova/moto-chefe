import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ABAS_FOLHA, avisoDaAba, hrefComFiltro, mesAdjacente, rotuloMes } from './folha-tela'

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
  for (const id of ['comissoes', 'adiantamentos', 'ajustes']) {
    assert.match(avisoDaAba(id) ?? '', /o filtro de loja não muda esta aba\. Segue o mês escolhido/, id)
  }
})

test('ABAS_FOLHA: as 7 abas na ordem da tela, só a Folha do Mês imprime', () => {
  assert.deepEqual(ABAS_FOLHA.map(a => a.id), ['mes', 'funcionarios', 'comissoes', 'premiacao', 'adiantamentos', 'holerites', 'ajustes'])
  assert.deepEqual(ABAS_FOLHA.filter(a => a.imprime).map(a => a.id), ['mes'])
})

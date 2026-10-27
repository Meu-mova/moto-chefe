import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarSeriesFaturamento } from './dashboard-series'

test('cada dia do período sai uma vez, com zero onde não houve venda', () => {
  const s = montarSeriesFaturamento(
    { inicio: '2026-10-01', fim: '2026-10-03', inicioAnterior: '2026-09-28' },
    [{ dia: '2026-10-02', valor: 100 }],
    [],
  )
  assert.deepEqual(s.map(p => [p.dia, p.atual]), [['2026-10-01', 0], ['2026-10-02', 100], ['2026-10-03', 0]])
})

test('o anterior é casado pela posição do dia dentro do período', () => {
  const s = montarSeriesFaturamento(
    { inicio: '2026-10-01', fim: '2026-10-02', inicioAnterior: '2026-09-29' },
    [],
    [{ dia: '2026-09-29', valor: 50 }, { dia: '2026-09-30', valor: 70 }],
  )
  assert.deepEqual(s.map(p => p.anterior), [50, 70])
})

test('acumulados somam dia a dia nas duas séries', () => {
  const s = montarSeriesFaturamento(
    { inicio: '2026-10-01', fim: '2026-10-03', inicioAnterior: '2026-09-28' },
    [{ dia: '2026-10-01', valor: 10 }, { dia: '2026-10-03', valor: 5 }],
    [{ dia: '2026-09-28', valor: 1 }, { dia: '2026-09-29', valor: 2 }, { dia: '2026-09-30', valor: 3 }],
  )
  assert.deepEqual(s.map(p => p.atualAcumulado), [10, 10, 15])
  assert.deepEqual(s.map(p => p.anteriorAcumulado), [1, 3, 6])
})

test('período que atravessa o fim do mês não perde nem repete dia', () => {
  const s = montarSeriesFaturamento({ inicio: '2026-02-27', fim: '2026-03-02', inicioAnterior: '2026-02-23' }, [], [])
  assert.deepEqual(s.map(p => p.dia), ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
})

test('venda fora dos dois períodos não entra em nenhuma série', () => {
  const s = montarSeriesFaturamento(
    { inicio: '2026-10-01', fim: '2026-10-01', inicioAnterior: '2026-09-30' },
    [{ dia: '2026-10-02', valor: 9 }],
    [{ dia: '2026-09-29', valor: 9 }],
  )
  assert.deepEqual(s, [{ dia: '2026-10-01', atual: 0, anterior: 0, atualAcumulado: 0, anteriorAcumulado: 0 }])
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularProjecao,
  diasDeVendaNoMes,
  diasDeVendaAte,
  diasNoMes,
  hojeEmBrasilia,
} from './meta-vendas'

// ── contagem de dias ─────────────────────────────────────────────────────────

test('julho/2026 tem 31 dias', () => {
  assert.equal(diasNoMes(2026, 7), 31)
})

test('fevereiro de ano bissexto', () => {
  assert.equal(diasNoMes(2024, 2), 29)
  assert.equal(diasNoMes(2026, 2), 28)
})

test('conta só seg–sáb: julho/2026 tem 4 domingos, então 27 dias de venda', () => {
  // 2026-07-01 é quarta; domingos caem em 5, 12, 19 e 26
  assert.equal(diasDeVendaNoMes(2026, 7), 27)
})

test('dias decorridos incluem o dia de hoje', () => {
  assert.equal(diasDeVendaAte(2026, 7, 1), 1)   // qua
  assert.equal(diasDeVendaAte(2026, 7, 4), 4)   // qua–sáb
  assert.equal(diasDeVendaAte(2026, 7, 5), 4)   // domingo não conta
  assert.equal(diasDeVendaAte(2026, 7, 6), 5)
})

test('dia além do fim do mês não estoura a contagem', () => {
  assert.equal(diasDeVendaAte(2026, 7, 99), diasDeVendaNoMes(2026, 7))
})

// ── projeção ─────────────────────────────────────────────────────────────────

test('ritmo mantido projeta a própria meta', () => {
  // 27 dias de venda; meta 200 → ~7,4/dia. Em 9 dias de venda, 74 vendas.
  const p = calcularProjecao({ meta: 200, vendidas: 74, ano: 2026, mes: 7, dia: 10 })
  assert.equal(p.diasDeVendaDecorridos, 9)
  assert.equal(p.diasDeVendaNoMes, 27)
  assert.equal(p.projecao, 222)
  assert.equal(p.situacao, 'acima')
})

test('ritmo fraco projeta abaixo e diz quanto falta por dia', () => {
  const p = calcularProjecao({ meta: 200, vendidas: 40, ano: 2026, mes: 7, dia: 10 })
  assert.equal(p.projecao, 120)
  assert.equal(p.situacao, 'abaixo')
  assert.equal(p.faltam, 160)
  assert.equal(p.diasDeVendaRestantes, 18)
  assert.ok(Math.abs(p.necessarioPorDia! - 160 / 18) < 0.001)
})

test('meta batida não pede mais nada por dia', () => {
  const p = calcularProjecao({ meta: 200, vendidas: 205, ano: 2026, mes: 7, dia: 28 })
  assert.equal(p.situacao, 'batida')
  assert.equal(p.faltam, 0)
  assert.equal(p.necessarioPorDia, null)
})

test('mês encerrado sem bater: não devolve infinito', () => {
  const p = calcularProjecao({ meta: 200, vendidas: 180, ano: 2026, mes: 7, dia: 31 })
  assert.equal(p.diasDeVendaRestantes, 0)
  assert.equal(p.necessarioPorDia, null)
  assert.equal(p.faltam, 20)
})

test('primeiro dia do mês, sem venda, não divide por zero', () => {
  const p = calcularProjecao({ meta: 200, vendidas: 0, ano: 2026, mes: 7, dia: 1 })
  assert.equal(p.projecao, 0)
  assert.equal(p.ritmoDiario, 0)
  assert.equal(p.situacao, 'abaixo')
})

test('domingo dia 5 usa os 4 dias de venda anteriores, não 5', () => {
  const p = calcularProjecao({ meta: 200, vendidas: 40, ano: 2026, mes: 7, dia: 5 })
  assert.equal(p.diasDeVendaDecorridos, 4)
  assert.equal(p.projecao, 270) // 10/dia × 27
})

test('meta zero não quebra o percentual', () => {
  const p = calcularProjecao({ meta: 0, vendidas: 10, ano: 2026, mes: 7, dia: 10 })
  assert.equal(p.percentualAtingido, 0)
  assert.equal(p.situacao, 'batida')
})

test('percentual atingido', () => {
  const p = calcularProjecao({ meta: 200, vendidas: 50, ano: 2026, mes: 7, dia: 10 })
  assert.equal(p.percentualAtingido, 25)
})

// ── fuso ─────────────────────────────────────────────────────────────────────
// A Vercel roda em UTC. Às 22h de Brasília já é o dia seguinte em UTC, e o
// dashboard mostraria "hoje" errado — e um dia a mais na conta do ritmo.

test('23h de Brasília ainda é o mesmo dia', () => {
  // 2026-07-10T23:30 em Brasília = 2026-07-11T02:30Z
  assert.deepEqual(hojeEmBrasilia(new Date('2026-07-11T02:30:00Z')), { ano: 2026, mes: 7, dia: 10 })
})

test('meio-dia UTC é o mesmo dia nos dois fusos', () => {
  assert.deepEqual(hojeEmBrasilia(new Date('2026-07-10T12:00:00Z')), { ano: 2026, mes: 7, dia: 10 })
})

test('virada de mês respeita Brasília', () => {
  // 2026-08-01T01:00Z = 2026-07-31T22:00 em Brasília
  assert.deepEqual(hojeEmBrasilia(new Date('2026-08-01T01:00:00Z')), { ano: 2026, mes: 7, dia: 31 })
})

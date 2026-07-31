import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDataInput } from './data-venda'

test('ancora no meio-dia UTC, não na meia-noite', () => {
  assert.equal(parseDataInput('2026-07-31').toISOString(), '2026-07-31T12:00:00.000Z')
})

test('mesmo dia do calendário em Brasília e em UTC', () => {
  const d = parseDataInput('2026-07-31')
  assert.equal(d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }), '31/07/2026')
  assert.equal(d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }), '31/07/2026')
})

test('não vira o dia dentro da faixa UTC-11..UTC+11', () => {
  const d = parseDataInput('2026-07-31')
  // Havaí (UTC-10) e Tóquio (UTC+9) — extremos bem além de qualquer fuso do Brasil
  assert.equal(d.toLocaleDateString('pt-BR', { timeZone: 'Pacific/Honolulu' }), '31/07/2026')
  assert.equal(d.toLocaleDateString('pt-BR', { timeZone: 'Asia/Tokyo' }), '31/07/2026')
})

test('rejeita formato fora de YYYY-MM-DD', () => {
  assert.throws(() => parseDataInput('31/07/2026'))
  assert.throws(() => parseDataInput(''))
})

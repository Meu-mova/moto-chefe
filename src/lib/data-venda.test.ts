import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDataInput, inicioDoDiaBrt, fimDoDiaBrt } from './data-venda'

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

// ─── limites do dia em Brasília ───────────────────────────────────────────────
// Filtrar "até 31/07" com `new Date('2026-07-31')` compara contra a MEIA-NOITE
// UTC do dia 31. Como as vendas são gravadas às 12:00Z (parseDataInput), toda
// venda do próprio dia 31 ficava de fora: 12 vendas e R$ 159.494,46 sumiram do
// filtro de julho/2026 por causa disso.

test('o fim do dia cobre a venda gravada ao meio-dia UTC', () => {
  const venda = parseDataInput('2026-07-31')
  assert.ok(venda <= fimDoDiaBrt('2026-07-31'), 'venda do dia 31 tem que caber no filtro até 31')
})

test('o início do dia cobre a venda gravada ao meio-dia UTC', () => {
  const venda = parseDataInput('2026-07-01')
  assert.ok(venda >= inicioDoDiaBrt('2026-07-01'), 'venda do dia 1 tem que caber no filtro desde 1')
})

test('os limites são as bordas do dia em Brasília, não em UTC', () => {
  assert.equal(inicioDoDiaBrt('2026-07-01').toISOString(), '2026-07-01T03:00:00.000Z')
  assert.equal(fimDoDiaBrt('2026-07-31').toISOString(), '2026-08-01T02:59:59.999Z')
})

test('o dia seguinte fica de fora', () => {
  const venda = parseDataInput('2026-08-01')
  assert.ok(venda > fimDoDiaBrt('2026-07-31'), 'venda de agosto não pode entrar no filtro de julho')
})

test('evento noturno do último dia continua no mês certo', () => {
  // OS concluída às 22h de 31/07 em Brasília = 01/08 01:00Z.
  const osNoturna = new Date('2026-08-01T01:00:00.000Z')
  assert.ok(osNoturna <= fimDoDiaBrt('2026-07-31'), 'evento das 22h do dia 31 é de julho')
})

test('rejeita formato fora de YYYY-MM-DD', () => {
  assert.throws(() => inicioDoDiaBrt('31/07/2026'))
  assert.throws(() => fimDoDiaBrt(''))
})

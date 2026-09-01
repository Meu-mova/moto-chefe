import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gerarCodigoCupom, normalizarCodigoCupom, statusCupom, motivoCupomInvalido,
  valorAbatidoPeloCupom, validadePadrao,
} from './cupom-revisao'

const cupom = (over: Partial<{ status: string; validoAte: string; osId: string | null }> = {}) => ({
  status: 'ativo', validoAte: '2026-12-31', osId: null, ...over,
})
const ctx = (over: Partial<{ hoje: string; osId: string; valorServicos: number }> = {}) => ({
  hoje: '2026-09-01', osId: 'os-1', valorServicos: 180, ...over,
})

// ── código ───────────────────────────────────────────────────────────────────

test('código sai no formato REV-XXXXXX', () => {
  assert.match(gerarCodigoCupom(), /^REV-[A-Z0-9]{6}$/)
})

test('código não usa caracteres que se confundem no papel', () => {
  // 300 sorteios cobrem o alfabeto inteiro com folga.
  for (let i = 0; i < 300; i++) {
    assert.equal(/[OIS015]/.test(gerarCodigoCupom().slice(4)), false)
  }
})

test('normaliza o que a pessoa digitar', () => {
  assert.equal(normalizarCodigoCupom('rev-a7k2m9'), 'REV-A7K2M9')
  assert.equal(normalizarCodigoCupom('A7K2M9'), 'REV-A7K2M9')
  assert.equal(normalizarCodigoCupom(' rev a7k2m9 '), 'REV-A7K2M9')
  assert.equal(normalizarCodigoCupom(''), '')
  assert.equal(normalizarCodigoCupom(null), '')
})

// ── status ───────────────────────────────────────────────────────────────────

test('vencido sai da data, não de coluna gravada', () => {
  assert.equal(statusCupom(cupom({ validoAte: '2026-08-31' }), '2026-09-01'), 'vencido')
  assert.equal(statusCupom(cupom({ validoAte: '2026-09-01' }), '2026-09-01'), 'ativo')
})

test('usado e cancelado ganham da data', () => {
  assert.equal(statusCupom(cupom({ status: 'usado', validoAte: '2020-01-01' }), '2026-09-01'), 'usado')
  assert.equal(statusCupom(cupom({ status: 'cancelado', validoAte: '2020-01-01' }), '2026-09-01'), 'cancelado')
})

// ── resgate ──────────────────────────────────────────────────────────────────

test('cupom ativo e dentro do prazo pode ser resgatado', () => {
  assert.equal(motivoCupomInvalido(cupom(), ctx()), null)
})

test('código inexistente devolve motivo, não null', () => {
  assert.equal(motivoCupomInvalido(null, ctx()), 'Cupom não encontrado')
})

test('cupom usado em OUTRA OS é recusado', () => {
  const r = motivoCupomInvalido(cupom({ status: 'usado', osId: 'os-9' }), ctx({ osId: 'os-1' }))
  assert.equal(r, 'Cupom já utilizado em outra OS')
})

test('reabrir o pagamento da mesma OS não acusa cupom já usado', () => {
  const r = motivoCupomInvalido(cupom({ status: 'usado', osId: 'os-1' }), ctx({ osId: 'os-1' }))
  assert.equal(r, null)
})

test('cupom cancelado é recusado mesmo dentro do prazo', () => {
  assert.equal(motivoCupomInvalido(cupom({ status: 'cancelado' }), ctx()), 'Cupom cancelado')
})

test('cupom vencido informa a data de vencimento', () => {
  const r = motivoCupomInvalido(cupom({ validoAte: '2026-08-20' }), ctx({ hoje: '2026-09-01' }))
  assert.equal(r, 'Cupom vencido em 20/08/2026')
})

test('OS só de peça não tem mão de obra para o cupom cobrir', () => {
  const r = motivoCupomInvalido(cupom(), ctx({ valorServicos: 0 }))
  assert.equal(r, 'Esta OS não tem mão de obra para o cupom cobrir')
})

// ── abatimento ───────────────────────────────────────────────────────────────

test('abate toda a mão de obra e nada das peças', () => {
  assert.equal(valorAbatidoPeloCupom(180), 180)
})

test('mão de obra negativa nunca vira crédito', () => {
  assert.equal(valorAbatidoPeloCupom(-50), 0)
  assert.equal(valorAbatidoPeloCupom(NaN), 0)
})

// ── validade ─────────────────────────────────────────────────────────────────

test('validade padrão é seis meses à frente', () => {
  assert.equal(validadePadrao('2026-09-01'), '2027-03-01')
  assert.equal(validadePadrao('2026-09-01', 3), '2026-12-01')
})

test('dia que não existe no mês de destino transborda, não some', () => {
  // 31/08 + 6 meses cairia em 31/02: vira 03/03. O prazo nunca encurta.
  assert.equal(validadePadrao('2026-08-31'), '2027-03-03')
})

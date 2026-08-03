import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNumeroBR, formatarNumeroBR } from './numero-br'

// ─── O bug que motivou este módulo ───────────────────────────────────────────
// O parser antigo apagava todos os pontos: "1880.50" virava 188050 e "0.5"
// virava 5. Salário e comissão saíam multiplicados por 100 sem ninguém ver.

test('ponto como separador decimal não multiplica por 100', () => {
  assert.equal(parseNumeroBR('1880.50'), 1880.5)
})

test('meio por cento digitado com ponto continua meio por cento', () => {
  assert.equal(parseNumeroBR('0.5'), 0.5)
  assert.equal(parseNumeroBR('1.00'), 1)
})

// ─── Padrão brasileiro ───────────────────────────────────────────────────────

test('vírgula é decimal', () => {
  assert.equal(parseNumeroBR('1880,50'), 1880.5)
  assert.equal(parseNumeroBR('0,5'), 0.5)
})

test('ponto de milhar com vírgula decimal', () => {
  assert.equal(parseNumeroBR('1.880,50'), 1880.5)
  assert.equal(parseNumeroBR('20.000.000,00'), 20000000)
})

test('ponto de milhar sozinho', () => {
  assert.equal(parseNumeroBR('1.880'), 1880)
  assert.equal(parseNumeroBR('1.234.567'), 1234567)
})

test('formato americano completo também é lido', () => {
  assert.equal(parseNumeroBR('1,880.50'), 1880.5)
})

test('número inteiro sem separador', () => {
  assert.equal(parseNumeroBR('2000'), 2000)
})

test('negativo, usado nos ajustes de base', () => {
  assert.equal(parseNumeroBR('-1.285,00'), -1285)
  assert.equal(parseNumeroBR('-320'), -320)
})

test('espaços não atrapalham', () => {
  assert.equal(parseNumeroBR('  1.880,50  '), 1880.5)
})

// ─── Entrada inválida devolve null, nunca 0 ──────────────────────────────────
// Zero silencioso num campo de salário é o pior resultado possível: salva errado
// sem avisar. null deixa o chamador recusar e mostrar erro.

test('vazio é null', () => {
  assert.equal(parseNumeroBR(''), null)
  assert.equal(parseNumeroBR('   '), null)
})

test('texto não numérico é null, não zero', () => {
  assert.equal(parseNumeroBR('abc'), null)
  assert.equal(parseNumeroBR('R$ 100'), null)
  assert.equal(parseNumeroBR('1.880,00x'), null)
})

test('zero de verdade continua zero', () => {
  assert.equal(parseNumeroBR('0'), 0)
  assert.equal(parseNumeroBR('0,00'), 0)
})

// ─── Formatação ──────────────────────────────────────────────────────────────

test('formata no padrão brasileiro', () => {
  assert.equal(formatarNumeroBR(1880), '1.880,00')
  assert.equal(formatarNumeroBR('1880.00'), '1.880,00')
  assert.equal(formatarNumeroBR(0.5), '0,50')
})

test('formata percentual com as casas pedidas', () => {
  assert.equal(formatarNumeroBR('0.50', 2), '0,50')
  assert.equal(formatarNumeroBR('1.50', 2), '1,50')
})

test('vazio e nulo viram string vazia, não "0,00"', () => {
  assert.equal(formatarNumeroBR(null), '')
  assert.equal(formatarNumeroBR(undefined), '')
  assert.equal(formatarNumeroBR(''), '')
})

test('ida e volta preserva o valor', () => {
  for (const v of [0, 0.5, 1880, 1880.5, 20000000, -1285]) {
    assert.equal(parseNumeroBR(formatarNumeroBR(v)), v)
  }
})

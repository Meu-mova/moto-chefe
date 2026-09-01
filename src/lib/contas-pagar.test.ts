import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mesAnterior, ultimoDiaDoMes, vencimentoNoMes, contaVigenteNoMes,
  situacaoOcorrencia, valorAutomatico, isTipoConta, isBaseFormula,
  isMesReferencia, mesApurado,
} from './contas-pagar'

// ── competência ──────────────────────────────────────────────────────────────

test('mês anterior vira o ano corretamente', () => {
  assert.equal(mesAnterior('2026-09'), '2026-08')
  assert.equal(mesAnterior('2026-01'), '2025-12')
})

test('último dia do mês cobre fevereiro e bissexto', () => {
  assert.equal(ultimoDiaDoMes('2026-02'), 28)
  assert.equal(ultimoDiaDoMes('2028-02'), 29)
  assert.equal(ultimoDiaDoMes('2026-04'), 30)
  assert.equal(ultimoDiaDoMes('2026-12'), 31)
})

// ── vencimento ───────────────────────────────────────────────────────────────

test('vencimento normal usa o dia cadastrado', () => {
  assert.equal(vencimentoNoMes('2026-09', 10), '2026-09-10')
})

test('dia 31 em mês de 30 cai no último dia, não vaza para o mês seguinte', () => {
  // Se transbordasse, a competência de abril apareceria dentro de maio.
  assert.equal(vencimentoNoMes('2026-04', 31), '2026-04-30')
  assert.equal(vencimentoNoMes('2026-02', 30), '2026-02-28')
})

test('dia fora da faixa é preso entre 1 e o último do mês', () => {
  assert.equal(vencimentoNoMes('2026-09', 0), '2026-09-01')
  assert.equal(vencimentoNoMes('2026-09', 99), '2026-09-30')
})

// ── vigência ─────────────────────────────────────────────────────────────────

const conta = (over: Partial<{ ativo: boolean; inicio: string | null; fim: string | null }> = {}) => ({
  ativo: true, inicio: null, fim: null, ...over,
})

test('conta sem vigência vale em qualquer mês', () => {
  assert.equal(contaVigenteNoMes(conta(), '2020-01'), true)
  assert.equal(contaVigenteNoMes(conta(), '2030-12'), true)
})

test('conta inativa não gera ocorrência nem dentro da vigência', () => {
  assert.equal(contaVigenteNoMes(conta({ ativo: false }), '2026-09'), false)
})

test('vigência recorta o começo e o fim, com fim inclusivo', () => {
  const c = conta({ inicio: '2026-09', fim: '2026-11' })
  assert.equal(contaVigenteNoMes(c, '2026-08'), false)
  assert.equal(contaVigenteNoMes(c, '2026-09'), true)
  assert.equal(contaVigenteNoMes(c, '2026-11'), true)
  assert.equal(contaVigenteNoMes(c, '2026-12'), false)
})

// ── situação ─────────────────────────────────────────────────────────────────

test('conta paga é paga, mesmo vencida', () => {
  assert.equal(situacaoOcorrencia({ pago: true, vencimento: '2026-01-05' }, '2026-09-01'), 'paga')
})

test('vencimento no passado sem pagamento fica vencida — o caso que se perdia', () => {
  assert.equal(situacaoOcorrencia({ pago: false, vencimento: '2026-08-10' }, '2026-09-01'), 'vencida')
})

test('vence hoje tem estado próprio', () => {
  assert.equal(situacaoOcorrencia({ pago: false, vencimento: '2026-09-01' }, '2026-09-01'), 'vence_hoje')
})

test('vencimento futuro é a vencer', () => {
  assert.equal(situacaoOcorrencia({ pago: false, vencimento: '2026-09-20' }, '2026-09-01'), 'a_vencer')
})

test('timestamp completo no vencimento não quebra a comparação', () => {
  assert.equal(situacaoOcorrencia({ pago: false, vencimento: '2026-08-10T00:00:00Z' }, '2026-09-01'), 'vencida')
})

// ── valor automático ─────────────────────────────────────────────────────────

test('imposto de 6% sobre a venda de motos do mês anterior', () => {
  assert.equal(valorAutomatico(512000, 6), 30720)
})

test('percentual com casas decimais', () => {
  assert.equal(valorAutomatico(100000, 0.2), 200)
})

test('mês anterior sem venda gera compromisso zerado, não NaN', () => {
  assert.equal(valorAutomatico(0, 6), 0)
  assert.equal(valorAutomatico(NaN, 6), 0)
})

test('base negativa não vira crédito disfarçado de conta a pagar', () => {
  assert.equal(valorAutomatico(-1000, 6), 0)
})

// ── validação ────────────────────────────────────────────────────────────────

test('valida tipo e base contra as listas fechadas', () => {
  assert.equal(isTipoConta('recorrente'), true)
  assert.equal(isTipoConta('parcelada'), false)
  assert.equal(isBaseFormula('venda_motos_com_nf'), true)
  assert.equal(isBaseFormula('lucro'), false)
})

// ── mês apurado pela fórmula ─────────────────────────────────────────────────

test('imposto e folha apuram o mês anterior', () => {
  assert.equal(mesApurado('2026-10', 'anterior'), '2026-09')
  assert.equal(mesApurado('2026-01', 'anterior'), '2025-12')
})

test('adiantamento apura o próprio mês da competência', () => {
  // O vale do dia 20/09 é o adiantamento lançado em setembro — é ele que a folha
  // de setembro, paga em 05/10, desconta.
  assert.equal(mesApurado('2026-09', 'corrente'), '2026-09')
})

test('mês de referência desconhecido cai em anterior, que é o padrão da coluna', () => {
  assert.equal(mesApurado('2026-09', 'qualquer'), '2026-08')
})

test('valida o mês de referência contra a lista fechada', () => {
  assert.equal(isMesReferencia('anterior'), true)
  assert.equal(isMesReferencia('corrente'), true)
  assert.equal(isMesReferencia('proximo'), false)
})

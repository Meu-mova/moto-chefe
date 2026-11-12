import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarPagamentos,
  somaPagamentos,
  pagamentosFecham,
  descreverPagamentos,
  pagamentosIncompletos,
} from './pagamentos-entrada'

test('registro antigo (pagamentos nulo) vira uma linha só, com o meio de pagamento legado', () => {
  const pgs = normalizarPagamentos({
    pagamentos: null,
    meioPagamento: 'pix',
    valorTotal: '1500.00',
    cartaoOperadora: null,
    cartaoParcelas: null,
  })
  assert.deepEqual(pgs, [{ tipo: 'pix', valor: 1500 }])
})

test('reserva antiga no cartão preserva operadora e parcelas', () => {
  const pgs = normalizarPagamentos({
    pagamentos: null,
    meioPagamento: 'cartao_credito',
    valorTotal: '900.50',
    cartaoOperadora: 'stone',
    cartaoParcelas: '3',
  })
  assert.deepEqual(pgs, [{ tipo: 'cartao_credito', valor: 900.5, operadora: 'stone', parcelas: 3 }])
})

test('reserva nova usa o jsonb e ignora as colunas legadas', () => {
  const pgs = normalizarPagamentos({
    pagamentos: [
      { tipo: 'pix', valor: 500 },
      { tipo: 'cartao_credito', valor: 500, operadora: 'stone', parcelas: 2 },
    ],
    meioPagamento: 'pix',
    valorTotal: '1000.00',
    cartaoOperadora: null,
    cartaoParcelas: null,
  })
  assert.equal(pgs.length, 2)
  assert.deepEqual(pgs[1], { tipo: 'cartao_credito', valor: 500, operadora: 'stone', parcelas: 2 })
})

test('jsonb vazio cai no legado — não deixa a reserva sem pagamento', () => {
  const pgs = normalizarPagamentos({
    pagamentos: [],
    meioPagamento: 'dinheiro',
    valorTotal: '300',
    cartaoOperadora: null,
    cartaoParcelas: null,
  })
  assert.deepEqual(pgs, [{ tipo: 'dinheiro', valor: 300 }])
})

test('soma os valores das linhas', () => {
  assert.equal(somaPagamentos([{ tipo: 'pix', valor: 500 }, { tipo: 'dinheiro', valor: 250.25 }]), 750.25)
})

test('fecha com o valor da entrada dentro do centavo', () => {
  const pgs = [{ tipo: 'pix', valor: 333.33 }, { tipo: 'dinheiro', valor: 333.33 }, { tipo: 'pix', valor: 333.34 }]
  assert.equal(pagamentosFecham(pgs, 1000), true)
  assert.equal(pagamentosFecham(pgs, 1000.5), false)
})

test('não fecha com entrada zerada', () => {
  assert.equal(pagamentosFecham([], 0), false)
})

test('descreve as formas para o histórico e o comprovante', () => {
  const texto = descreverPagamentos([
    { tipo: 'pix', valor: 500 },
    { tipo: 'cartao_credito', valor: 500, operadora: 'stone', parcelas: 3 },
  ])
  assert.equal(texto, 'PIX R$ 500,00 + Cartão de Crédito 3x R$ 500,00')
})

test('descreve tipo desconhecido sem quebrar', () => {
  assert.equal(descreverPagamentos([{ tipo: 'boleto', valor: 100 }]), 'boleto R$ 100,00')
})

test('sem meio de pagamento e sem jsonb não inventa linha (demanda sem sinal)', () => {
  const pgs = normalizarPagamentos({
    pagamentos: null,
    meioPagamento: null,
    valorTotal: null,
    cartaoOperadora: null,
    cartaoParcelas: null,
  })
  assert.deepEqual(pgs, [])
})

test('pagamentosFecham compara em centavos: 1 centavo a mais ou a menos sempre recusa, e o total exato sempre fecha', () => {
  for (const total of [100, 1000, 5000, 2.04, 12345.67, 0.3]) {
    assert.equal(pagamentosFecham([{ tipo: 'pix', valor: total + 0.01 }], total), false, `${total} + 0,01`)
    assert.equal(pagamentosFecham([{ tipo: 'pix', valor: total - 0.01 }], total), false, `${total} - 0,01`)
  }
  assert.equal(pagamentosFecham([{ tipo: 'pix', valor: 0.1 }, { tipo: 'dinheiro', valor: 0.2 }], 0.3), true)
  assert.equal(pagamentosFecham([{ tipo: 'pix', valor: 5000.01 }], 5000), false)
})

test('pagamentosIncompletos: forma sem tipo, sem valor ou com valor zero/negativo', () => {
  assert.equal(pagamentosIncompletos([{ tipo: 'pix', valor: 10 }, { tipo: 'dinheiro', valor: 0.01 }]), false)
  assert.equal(pagamentosIncompletos([{ tipo: '', valor: 10 }]), true)
  assert.equal(pagamentosIncompletos([{ tipo: 'pix', valor: 0 }]), true)
  assert.equal(pagamentosIncompletos([{ tipo: 'pix', valor: -5 }]), true)
  assert.equal(pagamentosIncompletos([{ tipo: 'pix', valor: Number.NaN }]), true)
})

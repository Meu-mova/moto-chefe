import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarPagamentosReserva,
  somaPagamentos,
  pagamentosFecham,
  descreverPagamentos,
} from './reserva-pagamentos'

test('reserva antiga (pagamentos nulo) vira uma linha só, com o meio de pagamento legado', () => {
  const pgs = normalizarPagamentosReserva({
    pagamentos: null,
    meioPagamento: 'pix',
    valorReserva: '1500.00',
    cartaoOperadora: null,
    cartaoParcelas: null,
  })
  assert.deepEqual(pgs, [{ tipo: 'pix', valor: 1500 }])
})

test('reserva antiga no cartão preserva operadora e parcelas', () => {
  const pgs = normalizarPagamentosReserva({
    pagamentos: null,
    meioPagamento: 'cartao_credito',
    valorReserva: '900.50',
    cartaoOperadora: 'stone',
    cartaoParcelas: '3',
  })
  assert.deepEqual(pgs, [{ tipo: 'cartao_credito', valor: 900.5, operadora: 'stone', parcelas: 3 }])
})

test('reserva nova usa o jsonb e ignora as colunas legadas', () => {
  const pgs = normalizarPagamentosReserva({
    pagamentos: [
      { tipo: 'pix', valor: 500 },
      { tipo: 'cartao_credito', valor: 500, operadora: 'stone', parcelas: 2 },
    ],
    meioPagamento: 'pix',
    valorReserva: '1000.00',
    cartaoOperadora: null,
    cartaoParcelas: null,
  })
  assert.equal(pgs.length, 2)
  assert.deepEqual(pgs[1], { tipo: 'cartao_credito', valor: 500, operadora: 'stone', parcelas: 2 })
})

test('jsonb vazio cai no legado — não deixa a reserva sem pagamento', () => {
  const pgs = normalizarPagamentosReserva({
    pagamentos: [],
    meioPagamento: 'dinheiro',
    valorReserva: '300',
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

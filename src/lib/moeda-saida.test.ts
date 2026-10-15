import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moedaDeSaida } from './moeda-saida'

// Intl usa espaço não separável entre "R$" e o número; normaliza para comparar.
const n = (s: string) => s.replace(/\s/g, ' ')

test('moedaDeSaida: valor negativo mostra um só sinal', () => {
  assert.equal(n(moedaDeSaida('-14.00')), '-R$ 14,00')
})

test('moedaDeSaida: valor positivo também vira saída', () => {
  assert.equal(n(moedaDeSaida('220')), '-R$ 220,00')
  assert.equal(n(moedaDeSaida(1234.5)), '-R$ 1.234,50')
})

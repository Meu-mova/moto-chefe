import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenarFaixas } from './premiacao'

test('ordenarFaixas: por venda mínima crescente, comparando como número', () => {
  const faixas = [
    { valorMinimoVendas: '300000', premiacao: '1200' },
    { valorMinimoVendas: '90000', premiacao: '300' },
    { valorMinimoVendas: '200000', premiacao: '800' },
  ]
  assert.deepEqual(ordenarFaixas(faixas).map(f => f.valorMinimoVendas), ['90000', '200000', '300000'])
})

test('ordenarFaixas: devolve cópia e não muda a lista recebida', () => {
  const faixas = [{ valorMinimoVendas: '2', premiacao: '1' }, { valorMinimoVendas: '1', premiacao: '1' }]
  ordenarFaixas(faixas)
  assert.deepEqual(faixas.map(f => f.valorMinimoVendas), ['2', '1'])
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sugerirModeloEPreco, precosParaCadastrar, type ModeloSugestao } from './entrada-preco'

const modelos: ModeloSugestao[] = [
  { id: 'id-pop', modelo: 'POP 110', precoCompraPadrao: '9850.00', ultimoPrecoCompra: '9600.00' },
  { id: 'id-fantom', modelo: 'FANTOM', precoCompraPadrao: null, ultimoPrecoCompra: '5400.00' },
  { id: 'id-susan', modelo: 'SUSAN', precoCompraPadrao: null, ultimoPrecoCompra: null },
]

test('preço cadastrado ganha do último praticado', () => {
  assert.deepEqual(sugerirModeloEPreco('POP 110', modelos), { modeloId: 'id-pop', preco: '9850.00' })
})

test('sem preço no cadastro, cai no último praticado', () => {
  assert.deepEqual(sugerirModeloEPreco('FANTOM', modelos), { modeloId: 'id-fantom', preco: '5400.00' })
})

test('sem preço em lugar nenhum, vem vazio para digitar', () => {
  assert.deepEqual(sugerirModeloEPreco('SUSAN', modelos), { modeloId: 'id-susan', preco: '' })
})

test('nome fora do cadastro não sugere nada', () => {
  assert.deepEqual(sugerirModeloEPreco('MODELO QUE NAO EXISTE', modelos), { modeloId: '', preco: '' })
})

test('casa o nome ignorando caixa, hífen e espaço repetido', () => {
  for (const nome of ['pop-110', 'POP  110', ' Pop 110 ']) {
    assert.equal(sugerirModeloEPreco(nome, modelos).modeloId, 'id-pop', `falhou para "${nome}"`)
  }
})

test('preço zerado no cadastro não é tratado como preço', () => {
  const comZero: ModeloSugestao[] = [
    { id: 'id-x', modelo: 'X', precoCompraPadrao: '0.00', ultimoPrecoCompra: '4200.00' },
  ]
  assert.equal(sugerirModeloEPreco('X', comZero).preco, '4200.00')
})

test('cadastra o preço de cada modelo que entrou', () => {
  const r = precosParaCadastrar([
    { modeloId: 'a', preco: '5400.00' },
    { modeloId: 'b', preco: '7000.00' },
  ])
  assert.deepEqual([...r], [['a', '5400.00'], ['b', '7000.00']])
})

test('modelo repetido no lote fica com o primeiro preço', () => {
  const r = precosParaCadastrar([
    { modeloId: 'a', preco: '5400.00' },
    { modeloId: 'a', preco: '5900.00' },
  ])
  assert.deepEqual([...r], [['a', '5400.00']])
})

test('preço vazio ou zerado não vira cadastro', () => {
  const r = precosParaCadastrar([
    { modeloId: 'a', preco: '' },
    { modeloId: 'b', preco: '0.00' },
    { modeloId: 'c', preco: '4200.00' },
  ])
  assert.deepEqual([...r], [['c', '4200.00']])
})

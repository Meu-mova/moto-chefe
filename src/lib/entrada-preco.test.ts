import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casarModelo, type ModeloSugestao } from './entrada-preco'

const modelos: ModeloSugestao[] = [
  { id: 'id-pop', modelo: 'POP 110' },
  { id: 'id-fantom', modelo: 'FANTOM' },
]

test('casa o nome com o modelo cadastrado', () => {
  assert.equal(casarModelo('FANTOM', modelos), 'id-fantom')
})

test('nome fora do cadastro não casa', () => {
  assert.equal(casarModelo('MODELO QUE NAO EXISTE', modelos), '')
})

test('casa o nome ignorando caixa, hífen e espaço repetido', () => {
  for (const nome of ['pop-110', 'POP  110', ' Pop 110 ']) {
    assert.equal(casarModelo(nome, modelos), 'id-pop', `falhou para "${nome}"`)
  }
})

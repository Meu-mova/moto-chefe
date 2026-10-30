import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casarModelo, precoDaPlanilha, type ModeloSugestao } from './entrada-preco'

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

test('PREÇO da planilha: número do Excel e texto em reais viram o valor do campo (#513)', () => {
  assert.equal(precoDaPlanilha(2016.38), '2016.38')
  assert.equal(precoDaPlanilha(6400), '6400.00')
  assert.equal(precoDaPlanilha('2.016,38'), '2016.38')
  assert.equal(precoDaPlanilha('R$ 2.016,38'), '2016.38')
  assert.equal(precoDaPlanilha('2016,38'), '2016.38')
  assert.equal(precoDaPlanilha('2016.38'), '2016.38')
  assert.equal(precoDaPlanilha('6.400'), '6400.00')
})

test('PREÇO da planilha vazio, zero ou ilegível não preenche (#513)', () => {
  for (const v of [undefined, null, '', '   ', 0, '0,00', 'a combinar', -10]) {
    assert.equal(precoDaPlanilha(v), '', `falhou para ${JSON.stringify(v)}`)
  }
})

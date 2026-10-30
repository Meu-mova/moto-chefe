import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casarComModelos, chaveDeModelo, lerPlanilhaDePrecos } from './planilha-precos'

test('lê MODELO + PREÇO, com R$, vírgula decimal e número do Excel', () => {
  const r = lerPlanilhaDePrecos([
    ['Modelo', 'Preço'],
    ['X12', 'R$ 9.990,00'],
    ['BOB', 12490.5],
    [],
  ])
  assert.deepEqual(r.erros, [])
  assert.deepEqual(r.linhas, [
    { linha: 2, modelo: 'X12', preco: 9990 },
    { linha: 3, modelo: 'BOB', preco: 12490.5 },
  ])
})

test('no formato da tabela da MotoChefe lê só a coluna PIX', () => {
  const r = lerPlanilhaDePrecos([
    ['MODELO', 'PIX', '12X', '18X', '21X'],
    ['X12 (1000W)', 100, 120, 130, 140],
  ])
  assert.deepEqual(r.linhas, [{ linha: 2, modelo: 'X12 (1000W)', preco: 100 }])
})

test('aceita DINHEIRO como coluna do preço', () => {
  assert.equal(lerPlanilhaDePrecos([['modelo', 'dinheiro'], ['X12', 5]]).linhas[0].preco, 5)
})

test('sem coluna de modelo ou de preço, recusa a planilha', () => {
  assert.match(lerPlanilhaDePrecos([['Nome', '12X'], ['X12', 1]]).erros[0], /MODELO/)
})

test('preço vazio, zero ou ilegível vira erro da linha, sem gravar', () => {
  const r = lerPlanilhaDePrecos([['MODELO', 'PIX'], ['X12', ''], ['BOB', 'abc'], ['JET', 0]])
  assert.deepEqual(r.linhas, [])
  assert.deepEqual(r.erros, ['Linha 2 (X12): preço inválido', 'Linha 3 (BOB): preço inválido', 'Linha 4 (JET): preço inválido'])
})

test('chave ignora caixa, acento, potência entre parênteses, espaço e hífen', () => {
  assert.equal(chaveDeModelo('Jet Max (1000W)'), chaveDeModelo('JETMAX'))
  assert.equal(chaveDeModelo('S8 - MINI (1000W)'), chaveDeModelo('S8-MINI'))
  assert.equal(chaveDeModelo('RETRÔ (VTB5/500W)'), chaveDeModelo('RETRO'))
  assert.notEqual(chaveDeModelo('X12'), chaveDeModelo('X11-12'))
})

const modelos = [
  { id: 'giga', nomes: ['GIGA'] },
  { id: 'vasco', nomes: ['VASCO'] },
  { id: 'x12', nomes: ['X12', 'X-12 NOVA'] },
  { id: 'a', nomes: ['DUPLO'] },
  { id: 'b', nomes: ['DUPLO'] },
]

test('casa pelo nome ou apelido; "/" casa cada alternativa', () => {
  const r = casarComModelos([
    { linha: 2, modelo: 'GIGA/VASCO (1000W)', preco: 10 },
    { linha: 3, modelo: 'x-12 nova', preco: 20 },
  ], modelos)
  assert.deepEqual(r.casados, [
    { modeloId: 'giga', preco: 10, linha: 2 },
    { modeloId: 'vasco', preco: 10, linha: 2 },
    { modeloId: 'x12', preco: 20, linha: 3 },
  ])
  assert.deepEqual(r.avisos, [])
})

test('sem casamento, ambíguo ou modelo repetido vira aviso e não grava', () => {
  const r = casarComModelos([
    { linha: 2, modelo: 'R10', preco: 1 },
    { linha: 3, modelo: 'DUPLO', preco: 2 },
    { linha: 4, modelo: 'X12', preco: 3 },
    { linha: 5, modelo: 'X12 (1000W)', preco: 4 },
  ], modelos)
  assert.deepEqual(r.casados, [])
  assert.deepEqual(r.avisos, [
    'Linha 2 (R10): modelo não encontrado',
    'Linha 3 (DUPLO): mais de um modelo com esse nome',
    'Linhas 4 e 5: o mesmo modelo (X12) aparece mais de uma vez',
  ])
})

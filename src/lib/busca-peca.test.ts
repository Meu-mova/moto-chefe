import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarPecas } from './busca-peca'

const CATALOGO = [
  { nome: 'CAPACETE FANTOM PRETO' },
  { nome: 'PARALAMA DIANTEIRO FANTOM' },
  { nome: 'Viseira (JET/ JET MAX)' },
  { nome: 'Viseira (MIA)' },
  { nome: 'VISEIRA NOVA (GIGA)' },
  { nome: 'Óleo de motor 20W50' },
]

test('busca vazia devolve tudo', () => {
  assert.equal(filtrarPecas(CATALOGO, '').length, CATALOGO.length)
  assert.equal(filtrarPecas(CATALOGO, '   ').length, CATALOGO.length)
})

test('ignora caixa e acento', () => {
  assert.deepEqual(filtrarPecas(CATALOGO, 'OLEO').map(p => p.nome), ['Óleo de motor 20W50'])
})

test('casa por termo solto, em qualquer ordem', () => {
  assert.deepEqual(filtrarPecas(CATALOGO, 'fantom paralama').map(p => p.nome), ['PARALAMA DIANTEIRO FANTOM'])
})

test('quem começa com o que foi digitado vem primeiro', () => {
  const nomes = filtrarPecas(CATALOGO, 'viseira').map(p => p.nome)
  assert.equal(nomes.length, 3)
  // As três casam, mas "PARALAMA..." nem entra; entre as viseiras, todas começam.
  assert.ok(nomes.every(n => n.toLowerCase().startsWith('viseira')))
})

test('prefixo ganha de quem só contém o termo no meio', () => {
  const lista = [{ nome: 'KIT VISEIRA' }, { nome: 'VISEIRA JET' }]
  assert.deepEqual(filtrarPecas(lista, 'viseira').map(p => p.nome), ['VISEIRA JET', 'KIT VISEIRA'])
})

test('nada encontrado devolve lista vazia', () => {
  assert.deepEqual(filtrarPecas(CATALOGO, 'guidao'), [])
})

test('respeita o limite mas nao perde o prefixo que aparece tarde', () => {
  // 50 peças que só CONTÊM "abc", e a última é a única que COMEÇA com "abc".
  const lista = [
    ...Array.from({ length: 50 }, (_, i) => ({ nome: `kit abc ${i}` })),
    { nome: 'abc final' },
  ]
  const achados = filtrarPecas(lista, 'abc', 5)
  assert.equal(achados.length, 5)
  assert.equal(achados[0].nome, 'abc final')
})

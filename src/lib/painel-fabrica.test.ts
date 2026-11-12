import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ehMarcaDoPainel, filtroDaUrl, urlDoFiltro, opcoesDoPainel, filtrarEstoque, filtrarVendas, resumirEstoque, resumirVendas, paraCsv, FILTRO_VAZIO,
  type LinhaEstoquePainel, type LinhaVendaPainel,
} from './painel-fabrica'

test('marca: só MotoChefe, em qualquer grafia; Voi e vazio ficam de fora', () => {
  for (const m of ['MotoChefe', 'MOTOCHEFE', 'Moto Chefe', 'moto-chefe ']) assert.equal(ehMarcaDoPainel(m), true, m)
  for (const m of ['Voi', 'VOI', 'MotoChefe Voi', '', null, undefined]) assert.equal(ehMarcaDoPainel(m), false, String(m))
})

const estoque: LinhaEstoquePainel[] = [
  { lojaId: 'a', modelo: 'X12', cor: 'PRETO', quantidade: 3 },
  { lojaId: 'b', modelo: 'X12', cor: 'PRETO', quantidade: 2 },
  { lojaId: 'b', modelo: 'X12', cor: 'BRANCO', quantidade: 1 },
  { lojaId: 'a', modelo: 'JETMAX', cor: 'AZUL', quantidade: 4 },
]

test('estoque soma modelo × cor de todas as lojas e bate com o total', () => {
  const r = resumirEstoque(estoque)
  assert.deepEqual(r.modeloCor, [
    { modelo: 'JETMAX', cor: 'AZUL', quantidade: 4 },
    { modelo: 'X12', cor: 'BRANCO', quantidade: 1 },
    { modelo: 'X12', cor: 'PRETO', quantidade: 5 },
  ])
  assert.equal(r.total, 10)
  assert.equal(r.modeloCor.reduce((s, l) => s + l.quantidade, 0), r.total)
  assert.equal(r.porLoja.reduce((s, l) => s + l.quantidade, 0), r.total)
  // A soma não mexe na entrada (a tela refiltra a mesma lista).
  assert.equal(estoque[0].quantidade, 3)
})

test('filtro vazio é tudo; cada filtro restringe e eles se combinam', () => {
  assert.equal(filtrarEstoque(estoque, FILTRO_VAZIO).length, 4)
  assert.equal(filtrarEstoque(estoque, { ...FILTRO_VAZIO, lojas: ['b'] }).length, 2)
  assert.equal(filtrarEstoque(estoque, { ...FILTRO_VAZIO, cores: ['PRETO'] }).length, 2)
  assert.deepEqual(filtrarEstoque(estoque, { lojas: ['a'], modelos: ['X12'], cores: ['PRETO'] }), [estoque[0]])
})

const vendas: LinhaVendaPainel[] = [
  { lojaId: 'a', modelo: 'X12', quantidade: 2 },
  { lojaId: 'b', modelo: 'X12', quantidade: 1 },
  { lojaId: 'b', modelo: 'JETMAX', quantidade: 5 },
]

test('vendas: matriz loja × modelo com totais que fecham', () => {
  const r = resumirVendas(vendas)
  assert.equal(r.celula('b', 'JETMAX'), 5)
  assert.equal(r.celula('a', 'JETMAX'), 0)
  assert.deepEqual(r.modelos, ['JETMAX', 'X12'])
  assert.equal(r.porLoja.get('b'), 6)
  assert.equal(r.porModelo.get('X12'), 3)
  assert.equal(r.total, 8)
})

test('cor não filtra venda; loja e modelo filtram', () => {
  assert.equal(filtrarVendas(vendas, { ...FILTRO_VAZIO, cores: ['PRETO'] }).length, 3)
  assert.equal(filtrarVendas(vendas, { ...FILTRO_VAZIO, lojas: ['b'], modelos: ['X12'] }).length, 1)
})

test('filtro vai e volta pela URL, com um ou vários valores', () => {
  assert.deepEqual(filtroDaUrl({}), FILTRO_VAZIO)
  assert.deepEqual(filtroDaUrl({ loja: 'a', modelo: ['X12', ' ', 'JETMAX'], cor: undefined }), { lojas: ['a'], modelos: ['X12', 'JETMAX'], cores: [] })
  const q = new URLSearchParams(urlDoFiltro({ lojas: ['a', 'b'], modelos: ['X 12'], cores: ['PRETO'] }, '2026-11-01', '2026-11-09'))
  assert.deepEqual(filtroDaUrl({ loja: q.getAll('loja'), modelo: q.getAll('modelo'), cor: q.getAll('cor') }), { lojas: ['a', 'b'], modelos: ['X 12'], cores: ['PRETO'] })
  assert.equal(q.get('de'), '2026-11-01')
})

test('opções juntam modelos do estoque e das vendas, sem repetir', () => {
  const o = opcoesDoPainel(estoque, [...vendas, { lojaId: 'a', modelo: 'DRIFT', quantidade: 1 }])
  assert.deepEqual(o.modelos, ['DRIFT', 'JETMAX', 'X12'])
  assert.deepEqual(o.cores, ['AZUL', 'BRANCO', 'PRETO'])
})

test('CSV abre no Excel pt-BR e não executa fórmula', () => {
  const csv = paraCsv(['Loja', 'Qtd'], [['Loja; Centro', 3], ['=HYPERLINK("x")', 1], ['Diz "oi"', 0]])
  assert.ok(csv.startsWith('﻿Loja;Qtd\r\n'))
  assert.ok(csv.includes('"Loja; Centro";3\r\n'))
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")";1\r\n`))
  assert.ok(csv.includes('"Diz ""oi""";0\r\n'))
})

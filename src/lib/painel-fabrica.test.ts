import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ehMarcaDoPainel, filtroDaUrl, urlDoFiltro, abaDaUrl, opcoesDoPainel, filtrarEstoque, filtrarVendas, resumirEstoque, resumirVendas,
  planilhaDoPainel, celulasDaVenda, nomeDaLoja, paraCsv, FILTRO_VAZIO,
  type LinhaEstoquePainel, type LojaPainel, type VendaPainel,
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

const venda = (numero: number, lojaId: string, modelo: string, cor: string, data: string): VendaPainel =>
  ({ numero, data, lojaId, modelo, cor, chassi: `CH${numero}` })
const vendas: VendaPainel[] = [
  venda(101, 'a', 'X12', 'PRETO', '2026-10-02T15:00:00.000Z'),
  venda(102, 'a', 'X12', 'BRANCO', '2026-10-20T15:00:00.000Z'),
  venda(103, 'b', 'X12', 'PRETO', '2026-10-05T15:00:00.000Z'),
  venda(104, 'b', 'JETMAX', 'AZUL', '2026-10-10T15:00:00.000Z'),
  venda(105, 'b', 'JETMAX', 'AZUL', '2026-10-10T15:00:00.000Z'),
]

test('vendas: a matriz loja × modelo sai da lista, uma moto por venda, e os totais fecham', () => {
  const r = resumirVendas(vendas)
  assert.equal(r.celula('b', 'JETMAX'), 2)
  assert.equal(r.celula('a', 'X12'), 2)
  assert.equal(r.celula('a', 'JETMAX'), 0)
  assert.deepEqual(r.modelos, ['JETMAX', 'X12'])
  assert.equal(r.porLoja.get('a'), 2)
  assert.equal(r.porLoja.get('b'), 3)
  assert.equal(r.porModelo.get('X12'), 3)
  assert.equal(r.porModelo.get('JETMAX'), 2)
  assert.equal(r.total, 5)
})

test('vendas: loja, modelo e cor filtram; da mais recente para a mais antiga, empate pelo número maior', () => {
  assert.deepEqual(filtrarVendas(vendas, FILTRO_VAZIO).map(v => v.numero), [102, 105, 104, 103, 101])
  assert.deepEqual(filtrarVendas(vendas, { ...FILTRO_VAZIO, cores: ['PRETO'] }).map(v => v.numero), [103, 101])
  assert.deepEqual(filtrarVendas(vendas, { lojas: ['b'], modelos: ['X12'], cores: [] }).map(v => v.numero), [103])
  assert.deepEqual(vendas.map(v => v.numero), [101, 102, 103, 104, 105], 'a ordem não mexe na entrada')
})

test('filtro e aba vão e voltam pela URL, com um ou vários valores', () => {
  assert.deepEqual(filtroDaUrl({}), FILTRO_VAZIO)
  assert.deepEqual(filtroDaUrl({ loja: 'a', modelo: ['X12', ' ', 'JETMAX'], cor: undefined }), { lojas: ['a'], modelos: ['X12', 'JETMAX'], cores: [] })
  const q = new URLSearchParams(urlDoFiltro({ lojas: ['a', 'b'], modelos: ['X 12'], cores: ['PRETO'] }, '2026-11-01', '2026-11-09', 'vendas'))
  assert.deepEqual(filtroDaUrl({ loja: q.getAll('loja'), modelo: q.getAll('modelo'), cor: q.getAll('cor') }), { lojas: ['a', 'b'], modelos: ['X 12'], cores: ['PRETO'] })
  assert.equal(q.get('de'), '2026-11-01')
  assert.equal(abaDaUrl(q.get('aba') ?? undefined), 'vendas')
})

test('aba: só "vendas" abre as vendas; qualquer outra coisa é o estoque', () => {
  assert.equal(abaDaUrl('vendas'), 'vendas')
  for (const v of ['estoque', undefined, '', 'VENDAS', ['vendas']]) assert.equal(abaDaUrl(v), 'estoque', String(v))
})

test('opções juntam modelos e cores do estoque e das vendas, sem repetir', () => {
  const o = opcoesDoPainel(estoque, [...vendas, venda(106, 'a', 'DRIFT', 'VERDE', '2026-10-01T15:00:00.000Z')])
  assert.deepEqual(o.modelos, ['DRIFT', 'JETMAX', 'X12'])
  assert.deepEqual(o.cores, ['AZUL', 'BRANCO', 'PRETO', 'VERDE'])
})

const lojas: LojaPainel[] = [{ lojaId: 'a', lojaNome: 'Loja Centro' }, { lojaId: 'b', lojaNome: 'Loja Norte' }]
const dadosPlanilha = { lojas, estoque, de: '2026-10-01', ate: '2026-10-31', hoje: '2026-11-14' }

test('Excel das vendas: data e hora de Brasília, número, loja, modelo, cor e chassi, na ordem da lista', () => {
  const tarde = venda(201, 'b', 'X12', 'PRETO', '2026-11-01T01:30:00.000Z') // 22h30 de 31/10 em Brasília
  const p = planilhaDoPainel('vendas', { ...dadosPlanilha, vendas: [tarde, vendas[0]] })
  assert.equal(p.nome, 'vendas-motochefe-2026-10-01-a-2026-10-31.csv')
  assert.deepEqual(p.cabecalho, ['Data', 'Venda', 'Loja', 'Modelo', 'Cor', 'Chassi'])
  assert.deepEqual(p.linhas, [
    ['31/10/2026 22:30', 201, 'Loja Norte', 'X12', 'PRETO', 'CH201'],
    ['02/10/2026 12:00', 101, 'Loja Centro', 'X12', 'PRETO', 'CH101'],
  ])
})

test('nome da loja pelo id; loja fora da lista fica em branco', () => {
  const nome = nomeDaLoja(lojas)
  assert.deepEqual(['b', 'a', 'x'].map(nome), ['Loja Norte', 'Loja Centro', ''])
})

test('a linha do Excel de vendas é a mesma das células da venda', () => {
  const p = planilhaDoPainel('vendas', { ...dadosPlanilha, vendas })
  assert.deepEqual(p.linhas, vendas.map(v => celulasDaVenda(v, nomeDaLoja(lojas))))
})

test('Excel do estoque: loja, modelo, cor e quantidade, sem cidade nem empresa', () => {
  const p = planilhaDoPainel('estoque', { ...dadosPlanilha, vendas })
  assert.equal(p.nome, 'estoque-motochefe-2026-11-14.csv')
  assert.deepEqual(p.cabecalho, ['Loja', 'Modelo', 'Cor', 'Quantidade'])
  assert.deepEqual(p.linhas, [
    ['Loja Centro', 'JETMAX', 'AZUL', 4],
    ['Loja Centro', 'X12', 'PRETO', 3],
    ['Loja Norte', 'X12', 'BRANCO', 1],
    ['Loja Norte', 'X12', 'PRETO', 2],
  ])
})

test('CSV abre no Excel pt-BR e não executa fórmula', () => {
  const csv = paraCsv(['Loja', 'Qtd'], [['Loja; Centro', 3], ['=HYPERLINK("x")', 1], ['Diz "oi"', 0]])
  assert.ok(csv.startsWith('﻿Loja;Qtd\r\n'))
  assert.ok(csv.includes('"Loja; Centro";3\r\n'))
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")";1\r\n`))
  assert.ok(csv.includes('"Diz ""oi""";0\r\n'))
})

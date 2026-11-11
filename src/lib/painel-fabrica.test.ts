import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ehMarcaDoPainel, filtroDaUrl, urlDoFiltro, opcoesDoPainel, filtrarEstoque, filtrarVendas, agruparVendas,
  resumirEstoque, resumirVendas, paraCsv, podeVerPainelFabrica, rotaDoLoginFabrica, abaDaUrl, FILTRO_VAZIO,
  type LinhaEstoquePainel, type VendaPainel,
} from './painel-fabrica'

test('marca: só MotoChefe, em qualquer grafia; Voi e vazio ficam de fora', () => {
  for (const m of ['MotoChefe', 'MOTOCHEFE', 'Moto Chefe', 'moto-chefe ']) assert.equal(ehMarcaDoPainel(m), true, m)
  for (const m of ['Voi', 'VOI', 'MotoChefe Voi', '', null, undefined]) assert.equal(ehMarcaDoPainel(m), false, String(m))
})

test('quem abre o painel: o login da fábrica e o admin_geral; nenhum outro papel', () => {
  assert.equal(podeVerPainelFabrica({ papel: 'fabrica' }), true)
  assert.equal(podeVerPainelFabrica({ papel: 'admin_geral' }), true)
  for (const papel of ['admin_socio', 'admin_rede', 'aux_adm', 'vendedor', 'mecanico', 'motorista', 'cargo']) {
    assert.equal(podeVerPainelFabrica({ papel }), false, papel)
  }
})

test('login da fábrica: só /fabrica e /conta-desativada; o resto volta ao painel', () => {
  for (const c of ['/fabrica', '/fabrica/imprimir', '/fabrica/sair', '/conta-desativada']) assert.equal(rotaDoLoginFabrica(c, false), null, c)
  for (const c of ['/dashboard', '/vendas', '/admin/usuarios', '/fabricas', '/fabrica-x', '/login', '/trocar-senha', '/estoque/imprimir']) {
    assert.equal(rotaDoLoginFabrica(c, false), '/fabrica', c)
  }
})

test('login da fábrica: Server Action é recusada em qualquer rota, até no /fabrica', () => {
  for (const c of ['/fabrica', '/fabrica/imprimir', '/dashboard', '/admin/usuarios']) assert.equal(rotaDoLoginFabrica(c, true), 'recusar', c)
})

test('aba: só "vendas" muda; qualquer outra coisa é estoque', () => {
  assert.equal(abaDaUrl('vendas'), 'vendas')
  for (const v of ['estoque', undefined, '', 'VENDAS', ['vendas']]) assert.equal(abaDaUrl(v), 'estoque', String(v))
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
  assert.equal(estoque[0].quantidade, 3, 'a soma não mexe na entrada')
})

test('filtro vazio é tudo; cada filtro restringe e eles se combinam', () => {
  assert.equal(filtrarEstoque(estoque, FILTRO_VAZIO).length, 4)
  assert.equal(filtrarEstoque(estoque, { ...FILTRO_VAZIO, lojas: ['b'] }).length, 2)
  assert.equal(filtrarEstoque(estoque, { ...FILTRO_VAZIO, cores: ['PRETO'] }).length, 2)
  assert.deepEqual(filtrarEstoque(estoque, { lojas: ['a'], modelos: ['X12'], cores: ['PRETO'] }), [estoque[0]])
})

let seq = 0
const venda = (lojaId: string, modelo: string, cor: string, data: string): VendaPainel =>
  ({ vendaId: `v${++seq}`, numero: 100 + seq, data, lojaId, modelo, cor, chassi: `CH${seq}` })
const vendas: VendaPainel[] = [
  venda('a', 'X12', 'PRETO', '2026-10-02T15:00:00.000Z'),
  venda('a', 'X12', 'BRANCO', '2026-10-20T15:00:00.000Z'),
  venda('b', 'X12', 'PRETO', '2026-10-05T15:00:00.000Z'),
  venda('b', 'JETMAX', 'AZUL', '2026-10-10T15:00:00.000Z'),
  venda('b', 'JETMAX', 'AZUL', '2026-10-11T15:00:00.000Z'),
]

test('vendas: uma a uma viram loja × modelo, e a soma bate com a lista', () => {
  const r = resumirVendas(agruparVendas(vendas))
  assert.equal(r.celula('b', 'JETMAX'), 2)
  assert.equal(r.celula('a', 'X12'), 2)
  assert.equal(r.celula('a', 'JETMAX'), 0)
  assert.deepEqual(r.modelos, ['JETMAX', 'X12'])
  assert.equal(r.porLoja.get('b'), 3)
  assert.equal(r.total, vendas.length)
})

test('vendas filtradas por loja, modelo e cor, da mais recente para a mais antiga', () => {
  assert.deepEqual(filtrarVendas(vendas, FILTRO_VAZIO).map(v => v.data.slice(5, 10)), ['10-20', '10-11', '10-10', '10-05', '10-02'])
  assert.deepEqual(filtrarVendas(vendas, { ...FILTRO_VAZIO, cores: ['PRETO'] }).map(v => v.lojaId), ['b', 'a'])
  assert.equal(filtrarVendas(vendas, { lojas: ['b'], modelos: ['X12'], cores: [] }).length, 1)
})

test('filtro vai e volta pela URL, com aba e um ou vários valores', () => {
  assert.deepEqual(filtroDaUrl({}), FILTRO_VAZIO)
  assert.deepEqual(filtroDaUrl({ loja: 'a', modelo: ['X12', ' ', 'JETMAX'], cor: undefined }), { lojas: ['a'], modelos: ['X12', 'JETMAX'], cores: [] })
  const q = new URLSearchParams(urlDoFiltro({ lojas: ['a', 'b'], modelos: ['X 12'], cores: ['PRETO'] }, '2026-11-01', '2026-11-09', 'vendas'))
  assert.deepEqual(filtroDaUrl({ loja: q.getAll('loja'), modelo: q.getAll('modelo'), cor: q.getAll('cor') }), { lojas: ['a', 'b'], modelos: ['X 12'], cores: ['PRETO'] })
  assert.equal(q.get('de'), '2026-11-01')
  assert.equal(q.get('aba'), 'vendas')
})

test('opções juntam modelos e cores do estoque e das vendas, sem repetir', () => {
  const o = opcoesDoPainel(estoque, [...vendas, venda('a', 'DRIFT', 'VERDE', '2026-10-01T15:00:00.000Z')])
  assert.deepEqual(o.modelos, ['DRIFT', 'JETMAX', 'X12'])
  assert.deepEqual(o.cores, ['AZUL', 'BRANCO', 'PRETO', 'VERDE'])
})

test('CSV abre no Excel pt-BR e não executa fórmula', () => {
  const csv = paraCsv(['Loja', 'Qtd'], [['Loja; Centro', 3], ['=HYPERLINK("x")', 1], ['Diz "oi"', 0]])
  assert.ok(csv.startsWith('﻿Loja;Qtd\r\n'))
  assert.ok(csv.includes('"Loja; Centro";3\r\n'))
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")";1\r\n`))
  assert.ok(csv.includes('"Diz ""oi""";0\r\n'))
})

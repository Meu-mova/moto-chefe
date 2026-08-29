import test from 'node:test'
import assert from 'node:assert'
import { ITENS, itensVisiveis, podeAcessar, type UsuarioNav } from './navegacao'

const SEM_REGRA_PROPRIA = { entrada: false }

function ids(usuario: UsuarioNav, regras = SEM_REGRA_PROPRIA) {
  return itensVisiveis(usuario, regras).map(i => i.id).sort()
}

const ADMIN_GERAL: UsuarioNav = { papel: 'admin_geral' }
const SOCIO: UsuarioNav       = { papel: 'admin_socio' }
const AUX: UsuarioNav         = { papel: 'aux_adm' }
const VENDEDOR: UsuarioNav    = { papel: 'vendedor' }
const MECANICO: UsuarioNav    = { papel: 'mecanico' }

test('admin_geral vê tudo que não depende de regra própria', () => {
  const esperado = ITENS.filter(i => !i.regraPropria).map(i => i.id).sort()
  assert.deepEqual(ids(ADMIN_GERAL), esperado)
})

test('admin_socio vê tudo menos o que é exclusivo do admin_geral', () => {
  assert.deepEqual(ids(SOCIO), [
    'agenda', 'atendimento', 'bancos', 'bling', 'caixa', 'calendario',
    'calendario-categorias', 'canais', 'categorias-caixa', 'clientes',
    'comunicados', 'compras', 'conciliacao', 'dados-funcionarios', 'dashboard',
    'demandas', 'despesas', 'dre', 'financeiro', 'folha', 'garantias', 'kommo',
    'lojas', 'marketing', 'metas', 'modelos', 'montagens', 'ordens-servico',
    'origens', 'pecas', 'pecas-fabrica', 'pix', 'precificacao', 'radar',
    'relatorio-fabrica', 'servicos', 'showroom', 'simulador',
    'transferencias', 'vendas', 'veiculos-historico',
  ].sort())
})

test('aux_adm não vê financeiro de resultado nem cadastro de sistema', () => {
  assert.deepEqual(ids(AUX), [
    'agenda', 'atendimento', 'caixa', 'calendario', 'canais', 'clientes',
    'conciliacao', 'dashboard', 'demandas', 'garantias', 'marketing', 'metas',
    'montagens', 'ordens-servico', 'origens', 'pecas', 'pecas-fabrica', 'pix',
    'radar', 'relatorio-fabrica', 'servicos', 'showroom', 'simulador',
    'transferencias', 'vendas',
  ].sort())
})

test('vendedor vê o comercial, a oficina de balcão e o PIX', () => {
  assert.deepEqual(ids(VENDEDOR), [
    'agenda', 'calendario', 'clientes', 'dashboard', 'demandas', 'garantias',
    'ordens-servico', 'pecas', 'pix', 'radar', 'showroom', 'simulador',
    'transferencias', 'vendas',
  ].sort())
})

test('mecânico fica com o menu enxuto da oficina', () => {
  assert.deepEqual(ids(MECANICO), [
    'agenda', 'dashboard', 'garantias', 'ordens-servico', 'pecas',
  ].sort())
})

test('papeisExtras conta — papel principal sozinho não dá o item, o extra dá', () => {
  const mecanicoVendedor: UsuarioNav = { papel: 'mecanico', papeisExtras: ['vendedor'] }
  assert.ok(!ids(MECANICO).includes('vendas'))
  assert.ok(ids(mecanicoVendedor).includes('vendas'))

  const vendedorAux: UsuarioNav = { papel: 'vendedor', papeisExtras: ['aux_adm'] }
  assert.ok(!ids(VENDEDOR).includes('marketing'))
  assert.ok(ids(vendedorAux).includes('marketing'))

  const tiago: UsuarioNav = { papel: 'aux_adm', papeisExtras: ['vendedor'] }
  assert.ok(podeAcessar(tiago, '/pecas', SEM_REGRA_PROPRIA))
})

test('modulos_extras libera item fora do papel', () => {
  const joao: UsuarioNav = { papel: 'vendedor', modulosExtras: ['marketing'] }
  assert.ok(ids(joao).includes('marketing'))
  assert.ok(podeAcessar(joao, '/marketing', SEM_REGRA_PROPRIA))
})

test('modulos_bloqueados tira item que o papel dá', () => {
  const joao: UsuarioNav = { papel: 'vendedor', modulosBloqueados: ['pix'] }
  assert.ok(!ids(joao).includes('pix'))
  assert.equal(podeAcessar(joao, '/pix-mcp', SEM_REGRA_PROPRIA), false)
})

test('bloqueio ganha de liberação quando os dois marcam o mesmo item', () => {
  const confuso: UsuarioNav = {
    papel: 'vendedor', modulosExtras: ['marketing'], modulosBloqueados: ['marketing'],
  }
  assert.ok(!ids(confuso).includes('marketing'))
})

test('item de regra própria não é decidido pela tabela', () => {
  assert.ok(!ids(ADMIN_GERAL).includes('entrada'))
  assert.ok(ids(ADMIN_GERAL, { entrada: true }).includes('entrada'))
})

test('href desconhecido nunca é liberado', () => {
  assert.equal(podeAcessar(ADMIN_GERAL, '/rota-que-nao-existe', SEM_REGRA_PROPRIA), false)
})

test('todo item tem id único', () => {
  const vistos = new Set<string>()
  for (const i of ITENS) {
    assert.ok(!vistos.has(i.id), `id repetido: ${i.id}`)
    vistos.add(i.id)
  }
})

test('todo item tem href único', () => {
  // podeAcessar resolve por ITENS.find(i => i.href === href); dois itens com o
  // mesmo href fariam a rota herdar em silêncio a permissão do primeiro.
  const vistos = new Set<string>()
  for (const i of ITENS) {
    assert.ok(!vistos.has(i.href), `href repetido: ${i.href}`)
    vistos.add(i.href)
  }
})

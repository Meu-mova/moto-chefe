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
const MOTORISTA: UsuarioNav   = { papel: 'motorista' }

test('admin_geral vê tudo que não depende de regra própria', () => {
  const esperado = ITENS.filter(i => !i.regraPropria).map(i => i.id).sort()
  assert.deepEqual(ids(ADMIN_GERAL), esperado)
})

test('admin_socio vê tudo menos o que é exclusivo do admin_geral', () => {
  assert.deepEqual(ids(SOCIO), [
    'agenda', 'atendimento', 'bancos', 'bling', 'caixa', 'calendario',
    'calendario-categorias', 'canais', 'categorias-caixa', 'clientes',
    'cartoes', 'coletiva', 'comunicados', 'compras', 'conciliacao', 'contas-pagar', 'cupons', 'dados-funcionarios', 'dashboard', 'meus-documentos',
    'demandas', 'despesas', 'dre', 'fechamento', 'financeiro', 'folha', 'garantias', 'individual', 'kommo',
    'lojas', 'marketing', 'metas', 'modelos', 'montagens', 'notas-fiscais', 'ordens-servico',
    'origens', 'pecas', 'pecas-fabrica', 'pix', 'precificacao', 'radar', 'radar-fiscal',
    'relatorio-fabrica', 'servicos', 'showroom', 'simulador',
    'transferencias', 'vendas', 'veiculos-historico',
  ].sort())
})

test('aux_adm não vê financeiro de resultado nem cadastro de sistema', () => {
  assert.deepEqual(ids(AUX), [
    'agenda', 'atendimento', 'caixa', 'calendario', 'canais', 'clientes',
    'conciliacao', 'cupons', 'dashboard', 'demandas', 'garantias', 'marketing', 'metas', 'meus-documentos',
    'montagens', 'ordens-servico', 'origens', 'pecas', 'pecas-fabrica', 'pix',
    'radar', 'radar-fiscal', 'relatorio-fabrica', 'servicos', 'showroom', 'simulador',
    'transferencias', 'vendas',
  ].sort())
})

test('vendedor vê o comercial, a oficina de balcão e o PIX', () => {
  assert.deepEqual(ids(VENDEDOR), [
    'agenda', 'calendario', 'clientes', 'cupons', 'dashboard', 'demandas', 'garantias',
    'meus-documentos', 'ordens-servico', 'pecas', 'pix', 'radar', 'showroom', 'simulador',
    'transferencias', 'vendas',
  ].sort())
})

test('mecânico fica com o menu enxuto da oficina, mais o calendário da empresa', () => {
  // Calendário é TODOS de propósito: é informação da empresa (feriado, evento,
  // férias) e o mecânico não tem outro caminho para ela no sistema.
  // 'cupons' entra aqui porque o mecânico precisa conferir no balcão se o código
  // que o cliente trouxe existe e ainda vale — emitir e cancelar continua com gestor.
  assert.deepEqual(ids(MECANICO), [
    'agenda', 'calendario', 'cupons', 'dashboard', 'garantias', 'meus-documentos',
    'ordens-servico', 'pecas',
  ].sort())
})

test('motorista só pega o holerite e o calendário — a oficina fica de fora', () => {
  // O papel nasceu para a folha de pagamento: ele não abre OS, não mexe em peça
  // e não vê garantia. Se um dia precisar, o caminho é liberar por pessoa em
  // /admin/usuarios (modulos_extras), não engordar o papel.
  assert.deepEqual(ids(MOTORISTA), ['calendario', 'dashboard', 'meus-documentos'].sort())
  assert.ok(!podeAcessar(MOTORISTA, '/ordens-servico', SEM_REGRA_PROPRIA))
  assert.ok(!podeAcessar(MOTORISTA, '/folha-pagamento', SEM_REGRA_PROPRIA))
  assert.ok(podeAcessar(MOTORISTA, '/meus-documentos', SEM_REGRA_PROPRIA))
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

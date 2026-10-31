import test from 'node:test'
import assert from 'node:assert'
import { ITENS, MODULOS_DE_CARGO, acessaModulo, itensDoMenu, itensVisiveis, modulosQuePodeDar, podeAcessar, type Papel, type UsuarioNav } from './navegacao'
import { podeOperarNfSaida } from '@/app/(dashboard)/vendas/papeis-nf-saida'

const SEM_REGRA_PROPRIA = {}

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
    'agenda', 'atendimento', 'avaliacoes-google', 'bancos', 'caixa', 'calendario',
    'calendario-categorias', 'canais', 'categorias-caixa', 'clientes',
    'cartoes', 'coletiva', 'comunicados', 'compras', 'conciliacao', 'contas-pagar', 'contratos', 'cupons', 'dados-funcionarios', 'dashboard', 'meus-documentos',
    'demandas', 'despesas', 'dre', 'entrada', 'fechamento', 'financeiro', 'folha', 'garantias', 'individual', 'log', 'maquininhas',
    'marketing', 'metas', 'modelos', 'montagens', 'notas-emitidas', 'notas-fiscais', 'ordens-servico',
    'origens', 'pecas', 'pecas-fabrica', 'pix', 'precificacao', 'radar',
    'relatorio-fabrica', 'servicos', 'showroom', 'simulador',
    'transferencias', 'usuarios', 'vendas', 'veiculos-historico',
  ].sort())
})

test('aux_adm não vê financeiro de resultado nem cadastro de sistema', () => {
  assert.deepEqual(ids(AUX), [
    'agenda', 'atendimento', 'caixa', 'calendario', 'canais', 'clientes',
    'conciliacao', 'contratos', 'cupons', 'dashboard', 'demandas', 'garantias', 'marketing', 'metas', 'meus-documentos',
    'montagens', 'notas-emitidas', 'ordens-servico', 'origens', 'pecas', 'pecas-fabrica', 'pix',
    'radar', 'relatorio-fabrica', 'servicos', 'showroom', 'simulador',
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

test('Usuários não se libera por item: só o papel abre (#322)', () => {
  const joao: UsuarioNav = { papel: 'vendedor', modulosExtras: ['usuarios'] }
  assert.ok(!ids(joao).includes('usuarios'))
  assert.ok(!podeAcessar(joao, '/admin/usuarios', SEM_REGRA_PROPRIA))
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

test('Entrada (#488, decisão do Luis): sócio e geral pelo papel; aux_adm só liberado por pessoa; cargo e outras funções nunca', () => {
  assert.ok(acessaModulo(ADMIN_GERAL, 'entrada'))
  assert.ok(acessaModulo({ papel: 'admin_socio' }, 'entrada'))
  assert.ok(!acessaModulo({ papel: 'aux_adm' }, 'entrada'), 'aux_adm sem liberação')
  assert.ok(acessaModulo({ papel: 'aux_adm', modulosExtras: ['entrada'] }, 'entrada'), 'aux_adm liberado')
  assert.ok(ids({ papel: 'aux_adm', modulosExtras: ['entrada'] }).includes('entrada'), 'e aparece no menu')
  assert.ok(!acessaModulo({ papel: 'vendedor', modulosExtras: ['entrada'] }, 'entrada'), 'vendedor, nem liberado')
  assert.ok(!acessaModulo({ papel: 'cargo', modulosDoCargo: ['entrada'] }, 'entrada'), 'cargo, nem pelo cargo')
  assert.ok(!acessaModulo({ papel: 'cargo', modulosExtras: ['entrada'] }, 'entrada'), 'cargo, nem liberado')
  assert.ok(!acessaModulo({ papel: 'admin_socio', modulosBloqueados: ['entrada'] }, 'entrada'))
  assert.ok(!MODULOS_DE_CARGO.includes('entrada'))
  assert.deepEqual(ITENS.find(i => i.id === 'entrada')?.liberavelPara, ['aux_adm'])
})

test('item oculto some do menu de todos os papéis, e o admin_geral ainda abre a rota', () => {
  const ocultos = ITENS.filter(i => i.oculto)
  assert.ok(ocultos.length > 0)
  for (const usuario of [ADMIN_GERAL, SOCIO, AUX, VENDEDOR, MECANICO, MOTORISTA]) {
    const menu = itensDoMenu(usuario, SEM_REGRA_PROPRIA).map(i => i.id)
    for (const i of ocultos) assert.ok(!menu.includes(i.id), `${i.id} apareceu no menu de ${usuario.papel}`)
  }
  for (const i of ocultos) {
    assert.ok(podeAcessar(ADMIN_GERAL, i.href, SEM_REGRA_PROPRIA), `${i.href} ficou bloqueado`)
  }
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

test('Grupos e Lojas: só o admin_geral, nem com liberação individual (#306)', () => {
  const liberado: UsuarioNav = { papel: 'admin_socio', modulosExtras: ['grupos', 'lojas'] }
  for (const u of [SOCIO, AUX, liberado]) {
    assert.equal(podeAcessar(u, '/admin/grupos', SEM_REGRA_PROPRIA), false)
    assert.equal(podeAcessar(u, '/admin/lojas', SEM_REGRA_PROPRIA), false)
  }
  const papelExtra: UsuarioNav = { papel: 'admin_socio', papeisExtras: ['admin_geral'] }
  assert.equal(podeAcessar(papelExtra, '/admin/grupos', SEM_REGRA_PROPRIA), false, 'admin_geral só como papel extra não abre')
  assert.equal(podeAcessar(papelExtra, '/admin/lojas', SEM_REGRA_PROPRIA), false)
  assert.equal(podeAcessar(ADMIN_GERAL, '/admin/grupos', SEM_REGRA_PROPRIA), true)
  assert.equal(podeAcessar(ADMIN_GERAL, '/admin/lojas', SEM_REGRA_PROPRIA), true)
  const menu = itensDoMenu(ADMIN_GERAL, SEM_REGRA_PROPRIA).map(i => i.id)
  assert.ok(menu.includes('grupos') && menu.includes('lojas'), 'aparecem no menu do admin_geral')
})

test('Notas Emitidas: só quem emite NF de saída, nunca por liberação individual (#348)', () => {
  for (const u of [ADMIN_GERAL, SOCIO, AUX]) assert.ok(podeAcessar(u, '/notas-emitidas', SEM_REGRA_PROPRIA), u.papel)
  assert.ok(!podeAcessar(VENDEDOR, '/notas-emitidas', SEM_REGRA_PROPRIA))
  assert.ok(!podeAcessar({ papel: 'vendedor', modulosExtras: ['notas-emitidas'] }, '/notas-emitidas', SEM_REGRA_PROPRIA))
})

test('Notas Emitidas abre para exatamente os papéis que operam NF de saída (#348)', () => {
  const papeis: Papel[] = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista']
  for (const papel of papeis) {
    assert.equal(podeAcessar({ papel }, '/notas-emitidas', SEM_REGRA_PROPRIA), podeOperarNfSaida(papel), papel)
  }
})

test('cargo vê só os módulos marcados mais os que todos veem (#449)', () => {
  const cargo: UsuarioNav = { papel: 'cargo', modulosDoCargo: ['clientes', 'agenda'] }
  assert.deepEqual(ids(cargo), ['agenda', 'calendario', 'clientes', 'dashboard', 'meus-documentos'])
  assert.deepEqual(ids({ papel: 'cargo' }), ['calendario', 'dashboard', 'meus-documentos'])
})

test('cargo não abre tela só pelo papel nem só do admin_geral, mesmo marcada (#449)', () => {
  const cargo: UsuarioNav = { papel: 'cargo', modulosDoCargo: ['usuarios', 'lojas'] }
  assert.deepEqual(ids(cargo), ['calendario', 'dashboard', 'meus-documentos'])
})

test('bloqueio por pessoa ganha do cargo (#449)', () => {
  const cargo: UsuarioNav = { papel: 'cargo', modulosDoCargo: ['clientes'], modulosBloqueados: ['clientes'] }
  assert.ok(!ids(cargo).includes('clientes'))
})

test('módulos que o sócio pode dar: só os liberados para cargo que ele mesmo vê (#449)', () => {
  const liberados = ['clientes', 'caixa', 'usuarios', 'lojas']
  assert.deepEqual(modulosQuePodeDar(SOCIO, SEM_REGRA_PROPRIA, liberados), ['caixa', 'clientes'])
  assert.deepEqual(modulosQuePodeDar(VENDEDOR, SEM_REGRA_PROPRIA, liberados), ['clientes'])
})

test('a lista de módulos liberados para cargo só tem itens que existem e não são só de papel (#449)', () => {
  for (const id of MODULOS_DE_CARGO) {
    const item = ITENS.find(i => i.id === id)
    assert.ok(item && !item.soPeloPapel && !item.soAdminGeral && !item.regraPropria, id)
  }
})

test('acessaModulo segue a mesma regra do menu, por id (#450)', () => {
  assert.ok(acessaModulo({ papel: 'cargo', modulosDoCargo: ['clientes'] }, 'clientes'))
  assert.ok(!acessaModulo({ papel: 'cargo', modulosDoCargo: [] }, 'clientes'))
  assert.ok(!acessaModulo({ papel: 'mecanico' }, 'clientes'))
  assert.ok(acessaModulo({ papel: 'vendedor' }, 'clientes'))
  assert.ok(!acessaModulo({ papel: 'vendedor', modulosBloqueados: ['clientes'] }, 'clientes'))
  assert.ok(!acessaModulo({ papel: 'admin_geral' }, 'nao-existe'))
})

test('módulos liberados para cargo: clientes (#450)', () => {
  assert.deepEqual(MODULOS_DE_CARGO, ['clientes'])
})

test('itens da mesma seção ficam juntos na categoria, senão o subtítulo se repete no menu', () => {
  const vistas = new Set<string>()
  let anterior: string | undefined
  for (const i of ITENS) {
    const chave = i.secao ? `${i.categoria}/${i.secao}` : undefined
    if (chave && chave !== anterior) {
      assert.ok(!vistas.has(chave), `seção repetida: ${chave} (${i.id})`)
      vistas.add(chave)
    }
    anterior = chave
  }
})

test('Plataforma: papel só admin_geral', () => {
  const itens = ITENS.filter(i => i.categoria === 'plataforma')
  assert.ok(itens.length > 0)
  for (const i of itens) assert.deepStrictEqual(i.papeis, ['admin_geral'], i.id)
})

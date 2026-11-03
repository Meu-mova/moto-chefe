import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ITENS } from '../../src/lib/navegacao'
import { ROTAS_MATRIZ, USUARIOS_MATRIZ, esperado, falhaDaVisita, usuariosDaMatriz } from './acesso-rotas'

test('a matriz cobre toda rota da tabela de navegação e os 6 papéis do seed', () => {
  for (const i of ITENS.filter(i => !i.semTela)) assert.ok(ROTAS_MATRIZ.includes(i.href), i.href)
  assert.deepEqual(USUARIOS_MATRIZ.map(u => u.papel), ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista'])
})

test('permissão sem tela (Gerenciar cargos) não vira rota da matriz (#617)', () => {
  const semTela = ITENS.filter(i => i.semTela)
  assert.ok(semTela.length > 0)
  for (const i of semTela) assert.ok(!ROTAS_MATRIZ.includes(i.href), i.href)
})

test('o esperado segue a regra do papel', () => {
  assert.equal(esperado('admin_geral', '/admin/grupos'), 'abre')
  assert.equal(esperado('admin_socio', '/admin/grupos'), 'volta')
  assert.equal(esperado('vendedor', '/admin/kommo'), 'volta')
  // Bling e Kommo: só admin_geral, igual às actions (#579).
  assert.equal(esperado('admin_socio', '/admin/bling'), 'volta')
  assert.equal(esperado('admin_socio', '/admin/kommo'), 'volta')
  assert.equal(esperado('vendedor', '/dashboard'), 'abre')
})

const v = (caminhoFinal: string, extra: Partial<Parameters<typeof falhaDaVisita>[1]> = {}) =>
  ({ href: '/admin/grupos', caminhoFinal, status: 200, telaDeErro: false, ...extra })

test('sem permissão: passa só voltando ao Dashboard sem tela de erro (#579)', () => {
  assert.equal(falhaDaVisita('volta', v('/dashboard')), null)
  assert.equal(falhaDaVisita('volta', v('/admin/grupos', { telaDeErro: true })), 'mostrou "Erro ao carregar a página"')
  assert.equal(falhaDaVisita('volta', v('/admin/grupos')), 'sem permissão e ficou em /admin/grupos')
})

test('com permissão: passa abrindo a própria rota', () => {
  assert.equal(falhaDaVisita('abre', v('/admin/grupos')), null)
  assert.equal(falhaDaVisita('abre', v('/dashboard')), 'com permissão e foi para /dashboard')
  assert.equal(falhaDaVisita('abre', v('/login')), 'caiu no /login')
  assert.equal(falhaDaVisita('abre', v('/admin/grupos', { status: 500 })), 'status 500')
})

test('a lista de usuários pode vir de fora (cópia local, #594); sem ela, os do seed', () => {
  assert.deepEqual(usuariosDaMatriz(undefined), USUARIOS_MATRIZ)
  const lista = [{ email: 'x@a.com', papel: 'vendedor', rotulo: 'x***@a.com' }]
  assert.deepEqual(usuariosDaMatriz(JSON.stringify(lista)), lista)
  assert.throws(() => usuariosDaMatriz('[{"email":"x@a.com"}]'), /MATRIZ_USUARIOS/)
  assert.throws(() => usuariosDaMatriz('[]'), /MATRIZ_USUARIOS/)
})

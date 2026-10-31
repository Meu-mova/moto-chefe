import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ITENS } from '../../src/lib/navegacao'
import { ROTAS_MATRIZ, USUARIOS_MATRIZ, esperado, falhaDaVisita } from './acesso-rotas'

test('a matriz cobre toda rota da tabela de navegação e os 6 papéis do seed', () => {
  for (const i of ITENS) assert.ok(ROTAS_MATRIZ.includes(i.href), i.href)
  assert.deepEqual(USUARIOS_MATRIZ.map(u => u.papel), ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista'])
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

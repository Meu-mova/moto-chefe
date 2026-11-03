import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardaAcessoAGrupos, guardaAprovacao, papelDasListas } from './listas-do-cadastro'

test('quem tem cargo guarda as listas pelo papel da base; sem base, pelo próprio papel (#617)', () => {
  assert.equal(papelDasListas('cargo', 'admin_socio'), 'admin_socio')
  assert.equal(papelDasListas('cargo', 'aux_adm'), 'aux_adm')
  assert.equal(papelDasListas('cargo', null), 'cargo', 'cargo não achado: só o básico')
  assert.equal(papelDasListas('vendedor', null), 'vendedor')
  assert.equal(papelDasListas('admin_rede', null), 'admin_rede')
})

test('aprovação: admin_geral, admin de rede e sócio; acesso a grupos: sócio e admin de rede (#617)', () => {
  const papeis = ['admin_geral', 'admin_rede', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista', 'cargo']
  assert.deepEqual(papeis.filter(guardaAprovacao), ['admin_geral', 'admin_rede', 'admin_socio'])
  assert.deepEqual(papeis.filter(guardaAcessoAGrupos), ['admin_rede', 'admin_socio'])
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contaDoFormulario, gruposDaConta } from './grupos-do-formulario'

const grupos = [{ id: 'contagem', contaId: 'LOOP' }, { id: 'ipatinga', contaId: 'LOOP' }, { id: 'montes', contaId: 'MOC' }]
const lojas = [{ id: 'l-contagem', grupoId: 'contagem' }, { id: 'l-montes', grupoId: 'montes' }]

test('loja escolhida: só os grupos da Conta dela (Montes Claros some para quem é da LOOP)', () => {
  const conta = contaDoFormulario('l-contagem', lojas, grupos, [], undefined)
  assert.equal(conta, 'LOOP')
  assert.deepEqual(gruposDaConta(grupos, conta).map(g => g.id), ['contagem', 'ipatinga'])
})

test('trocar a loja recalcula a Conta', () => {
  assert.deepEqual(gruposDaConta(grupos, contaDoFormulario('l-montes', lojas, grupos, [], undefined)).map(g => g.id), ['montes'])
})

test('loja atual fora da lista (admin_geral em outro grupo): usa o grupo e a Conta do cadastro', () => {
  const inicial = { lojaId: 'l-fora', grupoDaLojaId: 'ipatinga', contaId: 'LOOP' }
  assert.equal(contaDoFormulario('l-fora', lojas, grupos, [], inicial), 'LOOP')
})

test('sem loja: Conta do primeiro grupo de acesso; sem nada, mostra todos', () => {
  assert.equal(contaDoFormulario('', lojas, grupos, ['montes'], undefined), 'MOC')
  assert.equal(contaDoFormulario('', lojas, grupos, [], undefined), null)
  assert.equal(gruposDaConta(grupos, null).length, 3)
})

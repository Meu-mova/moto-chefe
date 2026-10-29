import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocosDoSeletor } from './blocos-seletor'

const g = (id: string, contaId: string) => ({ id, nome: id, cor: null, contaId, contaNome: 'Conta ' + contaId })

test('só a própria Conta: um bloco sem título', () => {
  const blocos = blocosDoSeletor([g('a', 'X'), g('b', 'X')], 'X')
  assert.deepEqual(blocos.map(b => b.titulo), [null])
  assert.deepEqual(blocos[0].grupos.map(x => x.id), ['a', 'b'])
})

test('admin_rede com grupo liberado: Minha Conta e Outras Contas, a dona ao lado só no de fora', () => {
  const blocos = blocosDoSeletor([g('liberado', 'Y'), g('casa', 'X')], 'X')
  assert.deepEqual(blocos.map(b => b.titulo), ['Minha Conta', 'Outras Contas'])
  assert.deepEqual(blocos[0].grupos.map(x => [x.id, x.mostrarConta]), [['casa', false]])
  assert.deepEqual(blocos[1].grupos.map(x => [x.id, x.mostrarConta]), [['liberado', true]])
})

test('admin_geral (sem Conta): lista única, como hoje', () => {
  assert.deepEqual(blocosDoSeletor([g('a', 'X'), g('b', 'Y')], null).map(b => b.titulo), [null])
})

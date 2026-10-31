import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocosDoSeletor, filtrarBlocos, iniciaisDoGrupo } from './blocos-seletor'

const g = (id: string, contaId: string, extra = {}) => ({ id, nome: id, cor: null, contaId, contaNome: 'Conta ' + contaId, cidade: null, cnpj: '00000000000191', ...extra })

test('só a própria Conta: um bloco sem título', () => {
  const blocos = blocosDoSeletor([g('a', 'X'), g('b', 'X')], 'X')
  assert.deepEqual(blocos.map(b => b.titulo), [null])
  assert.deepEqual(blocos[0].grupos.map(x => x.id), ['a', 'b'])
})

test('admin_rede com grupo liberado: Sua conta e Acesso concedido, a Conta dona ao lado só no de fora', () => {
  const blocos = blocosDoSeletor([g('liberado', 'Y'), g('casa', 'X')], 'X')
  assert.deepEqual(blocos.map(b => b.titulo), ['Sua conta', 'Acesso concedido'])
  assert.deepEqual(blocos[0].grupos.map(x => [x.id, x.mostrarConta]), [['casa', false]])
  assert.deepEqual(blocos[1].grupos.map(x => [x.id, x.mostrarConta]), [['liberado', true]])
})

test('admin_geral (sem Conta): um bloco por Conta, em ordem de nome', () => {
  const blocos = blocosDoSeletor([g('b1', 'B', { contaNome: 'Beta' }), g('a1', 'A', { contaNome: 'Alfa' }), g('b2', 'B', { contaNome: 'Beta' })], null)
  assert.deepEqual(blocos.map(b => [b.titulo, b.grupos.map(x => x.id)]), [['Alfa', ['a1']], ['Beta', ['b1', 'b2']]])
  const soUm = blocosDoSeletor([g('Ipatinga', 'I', { contaNome: 'Ipatinga' })], null)
  assert.equal(soUm[0].titulo, null, 'Conta de um grupo com o mesmo nome não repete o título')
  assert.ok(blocos.every(b => b.grupos.every(x => !x.mostrarConta)), 'a Conta já está no título')
})

test('busca por nome, Conta, cidade ou parte do CNPJ, sem acento; bloco vazio some', () => {
  const blocos = blocosDoSeletor([
    g('Ipatinga', 'A', { contaNome: 'Rede', cidade: 'Ipatinga' }),
    g('Teófilo Otoni', 'B', { contaNome: 'Vale', cnpj: '12345678000199' }),
  ], null)
  const ids = (q: string) => filtrarBlocos(blocos, q).flatMap(b => b.grupos.map(x => x.id))
  assert.deepEqual(ids('teofilo'), ['Teófilo Otoni'])
  assert.deepEqual(ids('rede'), ['Ipatinga'])
  assert.deepEqual(ids('IPAT'), ['Ipatinga'])
  assert.deepEqual(ids('12.345'), ['Teófilo Otoni'])
  assert.deepEqual(ids(''), ['Ipatinga', 'Teófilo Otoni'])
  assert.deepEqual(filtrarBlocos(blocos, 'zzz'), [])
})

test('iniciais: duas palavras; uma palavra, duas letras; número no fim entra', () => {
  assert.equal(iniciaisDoGrupo('LOOP - Contagem'), 'LC')
  assert.equal(iniciaisDoGrupo('caratinga'), 'CA')
  assert.equal(iniciaisDoGrupo('Coronel Fabriciano 2'), 'CF2')
  assert.equal(iniciaisDoGrupo('Grupo Teste BH'), 'GB')
  assert.equal(iniciaisDoGrupo('Grupo Teste 292'), 'GT', 'número longo fica de fora')
})

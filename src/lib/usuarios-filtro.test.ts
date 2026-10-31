import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarUsuarios, type FiltrosUsuarios } from './usuarios-filtro'

const u = (nome: string, extra = {}) => ({ nome, email: nome.toLowerCase().replace(/ /g, '.') + '@exemplo.com', papel: 'vendedor', lojaNome: 'Loja Centro', contaId: 'A', ativo: true, ...extra })
const lista = [u('Helena Prado', { papel: 'admin_rede' }), u('Caio Fernandes'), u('Fernanda Tavares', { ativo: false, lojaNome: 'Loja Lagoa' }), u('Gustavo Amaral', { contaId: 'B', lojaNome: 'Loja Praia' })]
const f = (x: Partial<FiltrosUsuarios> = {}): FiltrosUsuarios => ({ busca: '', papel: '', contaId: '', situacao: 'todos', ...x })
const nomes = (x: Partial<FiltrosUsuarios>) => filtrarUsuarios(lista, f(x)).map(v => v.nome)

test('busca por nome, e-mail ou loja, sem acento', () => {
  assert.deepEqual(nomes({ busca: 'helena' }), ['Helena Prado'])
  assert.deepEqual(nomes({ busca: 'caio.fernandes@' }), ['Caio Fernandes'])
  assert.deepEqual(nomes({ busca: 'praia' }), ['Gustavo Amaral'])
})

test('função, Conta e situação combinam', () => {
  assert.deepEqual(nomes({ papel: 'admin_rede' }), ['Helena Prado'])
  assert.deepEqual(nomes({ contaId: 'B' }), ['Gustavo Amaral'])
  assert.deepEqual(nomes({ situacao: 'inativos' }), ['Fernanda Tavares'])
  assert.equal(nomes({ situacao: 'ativos' }).length, 3)
  assert.deepEqual(nomes({ contaId: 'A', situacao: 'ativos', busca: 'loja centro' }), ['Helena Prado', 'Caio Fernandes'])
})

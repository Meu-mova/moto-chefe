import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarContasDoUsuario, type LojaCredencial } from './fabrica-contas'

const LOJAS: LojaCredencial[] = [
  { id: 'l1', nome: 'Pouso Alegre', fabricaEmail: 'pouso@x.com',    fabricaSenha: 's' },
  { id: 'l2', nome: 'Varginha',     fabricaEmail: 'varginha@x.com', fabricaSenha: 's' },
  { id: 'l3', nome: 'Lavras',       fabricaEmail: null,             fabricaSenha: null },
]

test('usuário alocado numa loja só enxerga a conta dela', () => {
  const { contas } = filtrarContasDoUsuario({ lojaId: 'l2' }, LOJAS)
  assert.deepEqual(contas.map(c => c.lojaNome), ['Varginha'])
  assert.equal(contas[0].email, 'varginha@x.com')
})

test('admin sem loja enxerga todas as lojas do grupo que têm login', () => {
  const { contas } = filtrarContasDoUsuario({ lojaId: null }, LOJAS)
  assert.deepEqual(contas.map(c => c.lojaNome), ['Pouso Alegre', 'Varginha'])
})

test('loja sem login sai em semCredencial, não vira conta', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario({ lojaId: null }, LOJAS)
  assert.equal(contas.some(c => c.lojaNome === 'Lavras'), false)
  assert.deepEqual(semCredencial, ['Lavras'])
})

test('usuário de loja sem login não recebe a conta de outra loja', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario({ lojaId: 'l3' }, LOJAS)
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, ['Lavras'])
})

test('credencial só com espaço em branco conta como ausente', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario({ lojaId: null }, [
    { id: 'l4', nome: 'Itajuba', fabricaEmail: '   ', fabricaSenha: 's' },
  ])
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, ['Itajuba'])
})

test('lojaId que não está no grupo não devolve nada', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario({ lojaId: 'outro-grupo' }, LOJAS)
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, [])
})

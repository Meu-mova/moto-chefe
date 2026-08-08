import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarContasDoUsuario, lojaDaContaDaGarantia, type LojaCredencial } from './fabrica-contas'

const LOJAS: LojaCredencial[] = [
  { id: 'l1', nome: 'Pouso Alegre', fabricaEmail: 'pouso@x.com',    fabricaSenha: 's' },
  { id: 'l2', nome: 'Varginha',     fabricaEmail: 'varginha@x.com', fabricaSenha: 's' },
  { id: 'l3', nome: 'Lavras',       fabricaEmail: null,             fabricaSenha: null },
]

const AUX  = { papel: 'aux_adm',     lojaId: 'l2' }
const SOCIO_COM_LOJA = { papel: 'admin_socio', lojaId: 'l1' }
const GERAL = { papel: 'admin_geral', lojaId: null }

test('quem opera a loja só enxerga a conta dela', () => {
  const { contas } = filtrarContasDoUsuario(AUX, LOJAS)
  assert.deepEqual(contas.map(c => c.lojaNome), ['Varginha'])
  assert.equal(contas[0].email, 'varginha@x.com')
})

test('admin geral enxerga todas as lojas do grupo que têm login', () => {
  const { contas } = filtrarContasDoUsuario(GERAL, LOJAS)
  assert.deepEqual(contas.map(c => c.lojaNome), ['Pouso Alegre', 'Varginha'])
})

test('sócio com loja fixa enxerga o grupo inteiro, não só a loja dele', () => {
  const { contas } = filtrarContasDoUsuario(SOCIO_COM_LOJA, LOJAS)
  assert.deepEqual(contas.map(c => c.lojaNome), ['Pouso Alegre', 'Varginha'])
})

test('sócio que trocou de grupo enxerga as lojas do grupo aberto', () => {
  // A loja fixa dele (l1) não está na lista: é outro grupo. Escopar por lojaId
  // devolveria vazio — o bug que motivou escopar por papel.
  const { contas } = filtrarContasDoUsuario(SOCIO_COM_LOJA, [LOJAS[1]])
  assert.deepEqual(contas.map(c => c.lojaNome), ['Varginha'])
})

test('loja sem login sai em semCredencial, não vira conta', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario(GERAL, LOJAS)
  assert.equal(contas.some(c => c.lojaNome === 'Lavras'), false)
  assert.deepEqual(semCredencial, ['Lavras'])
})

test('usuário de loja sem login não recebe a conta de outra loja', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario({ papel: 'aux_adm', lojaId: 'l3' }, LOJAS)
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, ['Lavras'])
})

test('credencial só com espaço em branco conta como ausente', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario(GERAL, [
    { id: 'l4', nome: 'Itajuba', fabricaEmail: '   ', fabricaSenha: 's' },
  ])
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, ['Itajuba'])
})

test('senha só com espaço em branco também conta como ausente', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario(GERAL, [
    { id: 'l5', nome: 'Poços de Caldas', fabricaEmail: 'pocos@x.com', fabricaSenha: '  ' },
  ])
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, ['Poços de Caldas'])
})

test('não-admin sem loja não devolve nada', () => {
  const { contas, semCredencial } = filtrarContasDoUsuario({ papel: 'aux_adm', lojaId: null }, LOJAS)
  assert.deepEqual(contas, [])
  assert.deepEqual(semCredencial, [])
})

test('garantia sem conta marcada sincroniza pela conta da própria loja', () => {
  assert.equal(lojaDaContaDaGarantia({ lojaId: 'l2', fabricaContaLojaId: null }), 'l2')
})

test('pedido antigo de Varginha sincroniza pela conta velha, não pela de Varginha', () => {
  assert.equal(lojaDaContaDaGarantia({ lojaId: 'l2', fabricaContaLojaId: 'l1' }), 'l1')
})

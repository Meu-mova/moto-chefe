import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motivosDeFalha, USUARIOS_SMOKE, type Visita } from './smoke'

const OK: Visita = {
  tela: '/vendas', status: 200, caminhoFinal: '/vendas', respostas5xx: [], errosConsole: [], errosPagina: [],
}

test('visita limpa passa', () => {
  assert.deepEqual(motivosDeFalha(OK), [])
})

test('500, sem resposta, /login e redirecionamento contam como falha', () => {
  assert.deepEqual(motivosDeFalha({ ...OK, status: 500 }), ['status 500'])
  assert.deepEqual(motivosDeFalha({ ...OK, status: null }), ['sem resposta'])
  assert.deepEqual(motivosDeFalha({ ...OK, caminhoFinal: '/login' }), ['caiu no /login'])
  assert.deepEqual(motivosDeFalha({ ...OK, caminhoFinal: '/dashboard' }), ['redirecionou para /dashboard'])
})

test('erro de console, exceção e 5xx de requisição interna contam como falha', () => {
  const v = { ...OK, respostas5xx: ['POST /vendas 500'], errosConsole: ['x'], errosPagina: ['y'] }
  assert.deepEqual(motivosDeFalha(v), ['resposta 5xx: POST /vendas 500', 'console: x', 'exceção: y'])
})

test('as 8 telas da D17 estão cobertas, e o aux_adm não visita as de admin', () => {
  const geral = USUARIOS_SMOKE.find(u => u.email.startsWith('geral@'))!
  const aux = USUARIOS_SMOKE.find(u => u.email.startsWith('aux.'))!
  assert.deepEqual(new Set(geral.telas), new Set([
    '/dashboard', '/estoque', '/vendas', '/ordens-servico', '/conciliacao',
    '/folha-pagamento', '/financeiro', '/admin/notas-fiscais',
  ]))
  for (const t of ['/folha-pagamento', '/financeiro', '/admin/notas-fiscais']) assert.equal(aux.telas.includes(t), false)
})

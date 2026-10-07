import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeAcessar } from '../../src/lib/navegacao'
import { motivoUrlRecusada, motivosDeFalha, USUARIOS_SMOKE, type Visita } from './smoke'

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

test('com bypass, só preview do projeto ou dev.meumova.com, e sempre https', () => {
  assert.equal(motivoUrlRecusada('https://mova-motochefe-s4pgj7d24-mova-b9a1d2c8.vercel.app', true), null)
  assert.equal(motivoUrlRecusada('https://dev.meumova.com', true), null)
  assert.notEqual(motivoUrlRecusada('https://outro-projeto.vercel.app', true), null)
  assert.notEqual(motivoUrlRecusada('https://vercel.com/mova/mova-motochefe/abc', true), null)
  assert.notEqual(motivoUrlRecusada('http://dev.meumova.com', true), null)
  assert.notEqual(motivoUrlRecusada('não é url', true), null)
})

test('sem bypass (uso local), qualquer URL válida serve', () => {
  assert.equal(motivoUrlRecusada('http://localhost:3000', false), null)
})

test('cada usuário só visita tela que o papel dele acessa (navegacao.ts)', () => {
  const papelPorPrefixo = { 'aux.': 'aux_adm', 'geral@': 'admin_geral' } as const
  for (const usuario of USUARIOS_SMOKE) {
    const [, papel] = Object.entries(papelPorPrefixo).find(([p]) => usuario.email.startsWith(p))!
    for (const tela of usuario.telas) assert.ok(podeAcessar({ papel }, tela, {}), `${papel} em ${tela}`)
  }
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

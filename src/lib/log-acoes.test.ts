import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposDePermissaoAlterados, origemDaRequisicao } from './log-acoes'

test('IP é o primeiro do x-forwarded-for; user agent vem cortado', () => {
  const h = new Headers({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1', 'user-agent': 'a'.repeat(600) })
  const o = origemDaRequisicao(h)
  assert.equal(o.ip, '200.1.2.3')
  assert.equal(o.userAgent?.length, 500)
})

test('sem cabeçalhos, IP e user agent ficam nulos', () => {
  assert.deepEqual(origemDaRequisicao(new Headers()), { ip: null, userAgent: null })
})

test('x-real-ip quando não há x-forwarded-for', () => {
  assert.equal(origemDaRequisicao(new Headers({ 'x-real-ip': '177.0.0.9' })).ip, '177.0.0.9')
})

test('permissão: só os campos que mudaram, sem depender da ordem dos grupos', () => {
  const antes = { papel: 'vendedor', lojaId: 'l1', gruposAcesso: ['a', 'b'], gruposAprovacao: [], aprovaPagamentoSensivel: false, modulosExtras: [], modulosBloqueados: [] }
  assert.deepEqual(camposDePermissaoAlterados(antes, { ...antes, gruposAcesso: ['b', 'a'] }), [])
  assert.deepEqual(camposDePermissaoAlterados(antes, { ...antes, papel: 'aux_adm', modulosExtras: ['caixa'] }), ['papel', 'modulosExtras'])
})

// Corte de PIX/cartão por papel: admin desde 01/08/2026; os demais, só os últimos 30 dias.
import test from 'node:test'
import assert from 'node:assert/strict'
import { corteConciliacao, INICIO_CONCILIACAO, INICIO_CONCILIACAO_EM } from './conciliacao-periodo'
import { somarDias } from './data-venda'

const em3Nov = new Date('2026-11-03T15:00:00Z') // 12h de Brasília

test('admin vê desde o início da conciliação', () => {
  for (const papel of ['admin_geral', 'admin_socio']) {
    assert.deepEqual(corteConciliacao(papel, em3Nov), { data: INICIO_CONCILIACAO, em: INICIO_CONCILIACAO_EM })
  }
})

test('aux_adm e vendedor: 30 dias para trás, a partir de 00:00 de Brasília', () => {
  for (const papel of ['aux_adm', 'vendedor']) {
    const c = corteConciliacao(papel, em3Nov)
    assert.equal(c.data, '2026-10-04')
    assert.equal(c.em.toISOString(), '2026-10-04T03:00:00.000Z')
  }
})

test('a TED de 10/08 da venda 32058 fica fora para o aux_adm', () => {
  const ted = new Date('2026-08-10T03:00:00.000Z')
  assert.ok(ted < corteConciliacao('aux_adm', em3Nov).em)
  assert.ok(ted >= corteConciliacao('admin_geral', em3Nov).em)
})

test('depois das 21h o "hoje" é o de Brasília, não o de UTC', () => {
  // 02/11 às 22h em Brasília = 03/11 01h UTC: o corte ainda conta a partir de 02/11.
  assert.equal(corteConciliacao('aux_adm', new Date('2026-11-03T01:00:00Z')).data, '2026-10-03')
})

test('nunca antes de 01/08/2026, nem para quem tem corte de 30 dias', () => {
  assert.equal(corteConciliacao('aux_adm', new Date('2026-08-15T15:00:00Z')).data, INICIO_CONCILIACAO)
})

test('somarDias atravessa mês e ano, para frente e para trás', () => {
  assert.equal(somarDias('2026-11-03', -30), '2026-10-04')
  assert.equal(somarDias('2026-03-01', -1), '2026-02-28')
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01')
  assert.throws(() => somarDias('03/11/2026', 1))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vencimento, cobrancasDevidas, valorBase, acrescimoAtraso, bloqueiaEm, competencia, estaBloqueado, podePagarMensalidade, valorAtualizado } from './regras'

// 15/03/2027 às 10h em Brasília.
const ACESSO = new Date('2027-03-15T13:00:00Z')

test('1ª mensalidade vence 30 dias após o 1º acesso', () => {
  assert.equal(vencimento(ACESSO, 0), '2027-04-14')
})

test('as seguintes vencem no mesmo dia dos meses seguintes', () => {
  assert.equal(vencimento(ACESSO, 1), '2027-05-14')
  assert.equal(vencimento(ACESSO, 9), '2028-01-14')
})

test('1º acesso às 22h de Brasília conta no dia de Brasília, não no UTC', () => {
  // 31/03 22h BRT = 01/04 01h UTC.
  assert.equal(vencimento(new Date('2027-04-01T01:00:00Z'), 0), '2027-04-30')
})

test('dia 29, 30 ou 31 vira 28 a partir da 2ª mensalidade', () => {
  const acesso = new Date('2027-03-31T13:00:00Z') // 1ª vence 30/04
  assert.equal(vencimento(acesso, 0), '2027-04-30')
  assert.equal(vencimento(acesso, 1), '2027-05-28')
  assert.equal(vencimento(acesso, 2), '2027-06-28')
})

test('competência é o mês do vencimento', () => {
  assert.equal(competencia('2027-04-14'), '2027-04')
})

test('a cobrança nasce quando faltam 10 dias ou menos', () => {
  assert.deepEqual(cobrancasDevidas(ACESSO, '2027-04-03'), [])
  assert.deepEqual(cobrancasDevidas(ACESSO, '2027-04-04').map(c => c.vencimento), ['2027-04-14'])
})

test('cron parado: devolve também as que ficaram para trás', () => {
  assert.deepEqual(cobrancasDevidas(ACESSO, '2027-06-05').map(c => c.competencia), ['2027-04', '2027-05', '2027-06'])
})

test('implantação vai só na 1ª', () => {
  assert.equal(valorBase(0, 499, 999), 1498)
  assert.equal(valorBase(1, 499, 999), 499)
})

test('sem atraso, sem acréscimo', () => {
  assert.equal(acrescimoAtraso(499, '2027-04-14', '2027-04-14'), 0)
  assert.equal(acrescimoAtraso(499, '2027-04-14', '2027-04-10'), 0)
})

test('atraso: multa de 2% mais 1% ao mês pro rata dia', () => {
  // 30 dias: 9,98 + 4,99
  assert.equal(acrescimoAtraso(499, '2027-04-14', '2027-05-14'), 14.97)
  // 1 dia: 9,98 + 0,17
  assert.equal(acrescimoAtraso(499, '2027-04-14', '2027-04-15'), 10.15)
})

test('bloqueia no 6º dia após o vencimento', () => {
  assert.equal(bloqueiaEm('2027-04-14'), '2027-04-20')
})

test('bloqueio: em dia ou até o 5º dia de atraso, não; no 6º, sim', () => {
  assert.equal(estaBloqueado(['2027-04-14'], '2027-04-19'), false)
  assert.equal(estaBloqueado(['2027-04-14'], '2027-04-20'), true)
  assert.equal(estaBloqueado([], '2027-04-20'), false)
})

test('só admin_socio e admin_geral pagam pelo sistema', () => {
  assert.equal(podePagarMensalidade('admin_socio'), true)
  assert.equal(podePagarMensalidade('admin_geral'), true)
  assert.equal(podePagarMensalidade('aux_adm'), false)
  assert.equal(podePagarMensalidade('vendedor'), false)
})

test('valor atualizado soma o acréscimo do atraso', () => {
  assert.deepEqual(valorAtualizado(499, '2027-04-14', '2027-04-14'), { acrescimo: 0, total: 499 })
  assert.deepEqual(valorAtualizado(499, '2027-04-14', '2027-05-14'), { acrescimo: 14.97, total: 513.97 })
})

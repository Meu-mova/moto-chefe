import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vencimento, cobrancasDevidas, valorBase, acrescimoAtraso, bloqueiaEm, competencia, estaBloqueado, podePagarMensalidade, valorAtualizado, adesaoACobrar, ehRegimeNovo, basePrimeiraMensalidade, taxaDaPrimeiraMensalidade } from './regras'

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
  assert.equal(estaBloqueado([{ tipo: 'mensalidade', vencimento: '2027-04-14' }], '2027-04-19'), false)
  assert.equal(estaBloqueado([{ tipo: 'mensalidade', vencimento: '2027-04-14' }], '2027-04-20'), true)
  assert.equal(estaBloqueado([], '2027-04-20'), false)
})

test('só admin_socio e admin_geral pagam pelo sistema', () => {
  assert.equal(podePagarMensalidade('admin_socio'), true)
  assert.equal(podePagarMensalidade('admin_geral'), true)
  assert.equal(podePagarMensalidade('aux_adm'), false)
  assert.equal(podePagarMensalidade('vendedor'), false)
})

test('valor atualizado soma o acréscimo do atraso', () => {
  assert.deepEqual(valorAtualizado({ tipo: 'mensalidade', valor: 499, vencimento: '2027-04-14' }, '2027-04-14'), { acrescimo: 0, total: 499 })
  assert.deepEqual(valorAtualizado({ tipo: 'mensalidade', valor: 499, vencimento: '2027-04-14' }, '2027-05-14'), { acrescimo: 14.97, total: 513.97 })
})

test('adesão: só o contrato assinado na versão 2 cobra, no valor da taxa da ficha', () => {
  assert.equal(adesaoACobrar({ versaoAssinada: 2, taxaFicha: '399.00', isento: false }), 399)
  assert.equal(adesaoACobrar({ versaoAssinada: 1, taxaFicha: '399.00', isento: false }), null)
  assert.equal(adesaoACobrar({ versaoAssinada: null, taxaFicha: '399.00', isento: false }), null)
})

test('adesão: taxa zero ou vazia, ou grupo isento, não cobra', () => {
  assert.equal(adesaoACobrar({ versaoAssinada: 2, taxaFicha: '0.00', isento: false }), null)
  assert.equal(adesaoACobrar({ versaoAssinada: 2, taxaFicha: null, isento: false }), null)
  assert.equal(adesaoACobrar({ versaoAssinada: 2, taxaFicha: '399.00', isento: true }), null)
})

test('adesão em aberto bloqueia no mesmo dia, sem os 5 dias da mensalidade', () => {
  assert.equal(estaBloqueado([{ tipo: 'adesao', vencimento: '2027-04-14' }], '2027-04-14'), true)
  assert.equal(estaBloqueado([{ tipo: 'mensalidade', vencimento: '2027-04-14' }], '2027-04-14'), false)
})

test('adesão não tem multa nem juros: o total é sempre a taxa', () => {
  assert.deepEqual(valorAtualizado({ tipo: 'adesao', valor: '399.00', vencimento: '2027-04-14' }, '2027-05-14'), { acrescimo: 0, total: 399 })
})

test('regime novo só com o contrato assinado na versão 2', () => {
  assert.deepEqual([2, 1, null].map(ehRegimeNovo), [true, false, false])
})

const PRIMEIRO_ACESSO = new Date('2026-11-05T15:00:00Z')
// Pagamento da adesão às 22h de Brasília de 09/11 (já 10/11 no UTC).
const PAGO_EM = new Date('2026-11-10T01:00:00Z')

test('regime antigo: a 1ª mensalidade conta do 1º acesso, com ou sem adesão', () => {
  assert.equal(basePrimeiraMensalidade({ regimeNovo: false, cobraAdesao: false, primeiroAcesso: PRIMEIRO_ACESSO, adesao: null }), PRIMEIRO_ACESSO)
})

test('regime novo com a adesão paga: conta do dia (Brasília) do pagamento, não do 1º acesso', () => {
  const base = basePrimeiraMensalidade({ regimeNovo: true, cobraAdesao: true, primeiroAcesso: PRIMEIRO_ACESSO, adesao: { status: 'paga', pagoEm: PAGO_EM } })
  assert.equal(base, PAGO_EM)
  assert.equal(vencimento(base!, 0), '2026-12-09')
  assert.equal(vencimento(base!, 1), '2027-01-09')
})

test('regime novo com a adesão aberta ou cancelada: ainda não há 1ª mensalidade', () => {
  for (const status of ['aberta', 'cancelada'] as const) {
    assert.equal(basePrimeiraMensalidade({ regimeNovo: true, cobraAdesao: true, primeiroAcesso: PRIMEIRO_ACESSO, adesao: { status, pagoEm: null } }), null, status)
  }
})

test('regime novo sem cobrança de adesão (taxa zero ou vazia): conta do 1º acesso', () => {
  assert.equal(basePrimeiraMensalidade({ regimeNovo: true, cobraAdesao: false, primeiroAcesso: PRIMEIRO_ACESSO, adesao: null }), PRIMEIRO_ACESSO)
})

test('regime novo que cobra adesão, mas ela ainda não foi criada: sem mensalidade', () => {
  assert.equal(basePrimeiraMensalidade({ regimeNovo: true, cobraAdesao: true, primeiroAcesso: PRIMEIRO_ACESSO, adesao: null }), null)
})

test('regime novo: a 1ª mensalidade vai sem a taxa; o antigo continua com ela', () => {
  assert.equal(taxaDaPrimeiraMensalidade(true, 399), 0)
  assert.equal(taxaDaPrimeiraMensalidade(false, 399), 399)
})

test('pagamento em 31/03: 1ª em 30/04, depois 28 nos meses seguintes', () => {
  const base = basePrimeiraMensalidade({ regimeNovo: true, cobraAdesao: true, primeiroAcesso: PRIMEIRO_ACESSO, adesao: { status: 'paga', pagoEm: new Date('2027-03-31T13:00:00Z') } })!
  assert.deepEqual([0, 1, 2].map(n => vencimento(base, n)), ['2027-04-30', '2027-05-28', '2027-06-28'])
})

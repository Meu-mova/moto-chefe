import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearInfinitePay, type VendaInfinitePay } from './conciliacao-infinitepay'
import { dataBrt, chaveDedup, type TransacaoCartao } from './conciliacao-cartao'

// Venda real capturada do painel em 2026-08-04.
const VENDA: VendaInfinitePay = {
  id: 2611297499,
  datetime: '2026-08-03T19:28:52.425Z',
  type: 'contactless',
  amount: 26000,
  net_amount: 24706,
  brand: 'visa',
  method: 'credit',
  installments: 4,
  serial_number: 'PB1F248T73089',
  status: 'approved',
  nsu: 'SPB1F248T7308922050320260803160002',
  transaction_origin: 'pos',
  fee_percentage: 4.98,
}

test('centavos viram reais', () => {
  const [t] = mapearInfinitePay([VENDA])
  assert.equal(t.valorBruto, 260)
  assert.equal(t.valorLiquido, 247.06)
})

test('crédito e débito viram os nomes usados no banco', () => {
  assert.equal(mapearInfinitePay([VENDA])[0].tipo, 'credito')
  assert.equal(mapearInfinitePay([{ ...VENDA, method: 'debit' }])[0].tipo, 'debito')
})

test('venda em dinheiro digitada na maquininha é descartada', () => {
  assert.deepEqual(mapearInfinitePay([{ ...VENDA, method: 'money' }]), [])
})

test('venda negada é descartada', () => {
  assert.deepEqual(mapearInfinitePay([{ ...VENDA, status: 'denied' }]), [])
})

test('venda depois das 21h fica no dia certo em Brasília', () => {
  // 01:20Z do dia 04 é 22:20 do dia 03 em Brasília.
  assert.equal(dataBrt('2026-08-04T01:20:00.000Z'), '2026-08-03')
})

test('venda no meio da tarde fica no mesmo dia', () => {
  assert.equal(dataBrt('2026-08-03T19:28:52.425Z'), '2026-08-03')
})

test('data inválida estoura em vez de gravar dia errado', () => {
  assert.throws(() => dataBrt('ontem'))
})

test('rawData preserva o que o banco não tem coluna para guardar', () => {
  const [t] = mapearInfinitePay([VENDA])
  assert.equal(t.rawData?.fee_percentage, 4.98)
  assert.equal(t.rawData?.serial_number, 'PB1F248T73089')
})

test('status normalizado para a grafia do banco', () => {
  assert.equal(mapearInfinitePay([VENDA])[0].status, 'aprovado')
})

test('nsu vazio vira undefined, não string vazia', () => {
  assert.equal(mapearInfinitePay([{ ...VENDA, nsu: '' }])[0].nsu, undefined)
})

test('parcelas zero vira 1', () => {
  assert.equal(mapearInfinitePay([{ ...VENDA, installments: 0 }])[0].parcelas, 1)
})

test('dedup usa o nsu quando existe', () => {
  const [t] = mapearInfinitePay([VENDA])
  assert.deepEqual(chaveDedup(t), { campo: 'nsu', valor: VENDA.nsu! })
})

test('dedup cai no id da operadora quando não há nsu', () => {
  const [t] = mapearInfinitePay([{ ...VENDA, nsu: null }])
  assert.deepEqual(chaveDedup(t), { campo: 'id', valor: '2611297499' })
})

test('sem nsu e sem id não inventa chave', () => {
  const solta: TransacaoCartao = { dataTransacao: '2026-08-03', valorBruto: 10, parcelas: 1, tipo: 'credito', status: 'aprovado' }
  assert.equal(chaveDedup(solta), null)
})

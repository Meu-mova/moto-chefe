import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearStone, type VendaStone, type DetalheStone } from './conciliacao-stone'

// Par real capturado do painel em 2026-08-04.
const VENDA: VendaStone = {
  id: '31263367049280',
  created_at: '2026-07-31T20:15:04.267+00:00',
  payment_method: 'card',
  installments: 12,
  card_brand: 'MasterCard',
  card_transaction_type: 'credit',
  status: 'paid',
  amount: 334289,
  situation: 'Approved',
  origin: { type: 'pos', serial_number: 'PB0923AB76138' },
}

const DETALHE: DetalheStone = {
  id: '31263367049280',
  amount: 334289,
  net_amount: 298687,
  status: 'paid',
  card_transaction: {
    type: 'credit',
    authorization_code: '015507',
    installments: 12,
    mdr_amount: 7374,
  },
  origin: { type: 'pos', serial_number: 'PB0923AB76138' },
}

test('bruto e líquido saem em reais', () => {
  const [t] = mapearStone([{ venda: VENDA, detalhe: DETALHE }])
  assert.equal(t.valorBruto, 3342.89)
  assert.equal(t.valorLiquido, 2986.87)
})

// O CSV manual da Stone grava o STONE ID (o `id` da venda) na coluna de NSU —
// conferido nas 48 linhas importadas por CSV em produção, todas com 14 dígitos,
// entre elas esta mesma venda (nsu = '31263367049280'). O agente precisa gravar
// o mesmo valor, senão os dois caminhos não se enxergam e a mesma venda entra
// duas vezes.
test('o NSU é o STONE ID — a mesma chave que o CSV grava', () => {
  const [t] = mapearStone([{ venda: VENDA, detalhe: DETALHE }])
  assert.equal(t.nsu, '31263367049280')
  assert.equal(t.nsu, VENDA.id)
})

test('o código de autorização fica em autorizacao e em rawData', () => {
  const [t] = mapearStone([{ venda: VENDA, detalhe: DETALHE }])
  assert.equal(t.autorizacao, '015507')
  assert.equal(t.rawData?.authorization_code, '015507')
})

test('crédito e débito', () => {
  assert.equal(mapearStone([{ venda: VENDA, detalhe: DETALHE }])[0].tipo, 'credito')
  const [d] = mapearStone([{
    venda: { ...VENDA, card_transaction_type: 'debit' },
    detalhe: { ...DETALHE, card_transaction: { ...DETALHE.card_transaction, type: 'debit' } },
  }])
  assert.equal(d.tipo, 'debito')
})

test('o tipo vem do detalhe, não da venda (prioridade)', () => {
  // Venda diz crédito, detalhe diz débito — deve resultar em débito
  const [t] = mapearStone([{
    venda: { ...VENDA, card_transaction_type: 'credit' },
    detalhe: { ...DETALHE, card_transaction: { ...DETALHE.card_transaction, type: 'debit' } },
  }])
  assert.equal(t.tipo, 'debito')
})

test('venda não paga é descartada', () => {
  assert.deepEqual(mapearStone([{ venda: { ...VENDA, status: 'canceled' }, detalhe: DETALHE }]), [])
})

test('venda que não é cartão é descartada', () => {
  assert.deepEqual(mapearStone([{ venda: { ...VENDA, payment_method: 'pix' }, detalhe: DETALHE }]), [])
})

test('data em BRT, não no UTC de created_at', () => {
  assert.equal(mapearStone([{ venda: VENDA, detalhe: DETALHE }])[0].dataTransacao, '2026-07-31')
  const [virada] = mapearStone([{
    venda: { ...VENDA, created_at: '2026-08-01T02:10:00.000+00:00' },
    detalhe: DETALHE,
  }])
  assert.equal(virada.dataTransacao, '2026-07-31')
})

test('rawData guarda o id, o serial e a taxa', () => {
  const [t] = mapearStone([{ venda: VENDA, detalhe: DETALHE }])
  assert.equal(t.rawData?.id, '31263367049280')
  assert.equal(t.rawData?.serial_number, 'PB0923AB76138')
  assert.equal(t.rawData?.mdr_amount, 7374)
})

test('sem detalhe a venda não é enviada — líquido e autorização faltariam', () => {
  assert.deepEqual(mapearStone([{ venda: VENDA, detalhe: null }]), [])
})

// O detalhe é buscado depois da listagem: uma venda estornada nesse intervalo
// chega com a lista dizendo 'paid' e o detalhe já dizendo outra coisa.
test('detalhe que não está pago é descartado, mesmo com a lista dizendo pago', () => {
  assert.deepEqual(mapearStone([{ venda: VENDA, detalhe: { ...DETALHE, status: 'canceled' } }]), [])
})

test('líquido ausente não vira NaN — grava sem líquido', () => {
  const [t] = mapearStone([{ venda: VENDA, detalhe: { ...DETALHE, net_amount: undefined } }])
  assert.equal(t.valorLiquido, undefined)
  assert.equal(t.valorBruto, 3342.89)
})

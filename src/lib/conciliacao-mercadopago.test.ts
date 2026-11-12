import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { PagamentoMp } from './mercadopago/point'
import { classificarPagamento } from './conciliacao-mercadopago'
import credito3x from './fixtures/mercadopago/credito-3x.json'
import debito from './fixtures/mercadopago/debito.json'
import pix from './fixtures/mercadopago/pix.json'
import creditoEstornado from './fixtures/mercadopago/credito-estornado.json'
import creditoParcial from './fixtures/mercadopago/credito-parcial.json'
import pendente from './fixtures/mercadopago/pendente.json'
import linkCheckout from './fixtures/mercadopago/link-checkout.json'

const pg = (f: unknown, o: Partial<PagamentoMp> = {}): PagamentoMp => ({ ...(f as PagamentoMp), ...o })

describe('classificarPagamento', () => {
  it('crédito 3x aprovado vira cartão', () => {
    const c = classificarPagamento(pg(credito3x))
    assert.equal(c.tipo, 'cartao')
    if (c.tipo !== 'cartao') return
    const t = c.transacao
    assert.equal(t.tipo, 'credito')
    assert.equal(t.parcelas, 3)
    assert.equal(t.valorBruto, credito3x.transaction_amount)
    assert.equal(t.valorLiquido, credito3x.transaction_details.net_received_amount)
    assert.equal(t.nsu, String(credito3x.id))
    assert.equal(t.status, 'aprovado')
    assert.equal(t.rawData?.serial, 'FAKESERIAL01')
    assert.equal(t.rawData?.bandeira, credito3x.payment_method_id)
    assert.equal('payer' in (t.rawData ?? {}), false)
  })

  it('débito vira cartão débito com 1 parcela', () => {
    const c = classificarPagamento(pg(debito))
    assert.equal(c.tipo, 'cartao')
    if (c.tipo !== 'cartao') return
    assert.equal(c.transacao.tipo, 'debito')
    assert.equal(c.transacao.parcelas, 1)
  })

  it('Pix aprovado vira pix', () => {
    const c = classificarPagamento(pg(pix))
    assert.equal(c.tipo, 'pix')
    if (c.tipo !== 'pix') return
    assert.equal(c.pix.transacaoId, `mp-${pix.id}`)
    assert.equal(c.pix.valor, pix.transaction_amount)
    assert.equal(c.pix.data, pix.date_approved)
    assert.equal(c.pix.serial, 'FAKESERIAL01')
  })

  it('venda às 23:30 BRT cai no dia de Brasília', () => {
    const c = classificarPagamento(pg(credito3x, { date_approved: '2026-11-13T02:30:00.000Z' }))
    assert.equal(c.tipo, 'cartao')
    if (c.tipo === 'cartao') assert.equal(c.transacao.dataTransacao, '2026-11-12')
  })

  it('refunded, charged_back e cancelled viram estorno', () => {
    for (const status of ['refunded', 'charged_back', 'cancelled']) {
      assert.deepEqual(classificarPagamento(pg(creditoEstornado, { status })), {
        tipo: 'estorno', meio: 'cartao', chave: String(creditoEstornado.id),
      })
      assert.deepEqual(classificarPagamento(pg(pix, { status })), {
        tipo: 'estorno', meio: 'pix', chave: `mp-${pix.id}`,
      })
    }
  })

  it('parcialmente estornado continua cartão aprovado', () => {
    const c = classificarPagamento(pg(creditoParcial))
    assert.equal(c.tipo, 'cartao')
    if (c.tipo !== 'cartao') return
    assert.equal(c.transacao.status, 'aprovado')
    assert.equal(c.transacao.rawData?.estornado, creditoParcial.transaction_amount_refunded)
  })

  it('pagamento sem point_of_interaction de maquininha é ignorado', () => {
    assert.equal(classificarPagamento(pg(linkCheckout)).tipo, 'ignorar')
    assert.equal(classificarPagamento(pg(linkCheckout, { point_of_interaction: undefined })).tipo, 'ignorar')
  })

  it('pending/in_process é ignorado', () => {
    assert.equal(classificarPagamento(pg(pendente)).tipo, 'ignorar')
    assert.equal(classificarPagamento(pg(credito3x, { status: 'pending' })).tipo, 'ignorar')
  })
})

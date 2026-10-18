import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { motivoBloqueioCriarPedido, podeCancelarPedido } from './pedido-venda-regras'

const pedido = { status: 'pendente', lojaId: 'loja-a', vendedorId: 'vend-1' }

describe('podeCancelarPedido', () => {
  test('admin geral e sócio cancelam qualquer pedido pendente', () => {
    assert.equal(podeCancelarPedido({ id: 'x', papel: 'admin_geral', lojaId: null }, pedido), true)
    assert.equal(podeCancelarPedido({ id: 'x', papel: 'admin_socio', lojaId: 'loja-b' }, pedido), true)
  })

  test('aux_adm só na própria loja', () => {
    assert.equal(podeCancelarPedido({ id: 'x', papel: 'aux_adm', lojaId: 'loja-a' }, pedido), true)
    assert.equal(podeCancelarPedido({ id: 'x', papel: 'aux_adm', lojaId: 'loja-b' }, pedido), false)
  })

  test('vendedor só o pedido que criou, na própria loja', () => {
    assert.equal(podeCancelarPedido({ id: 'vend-1', papel: 'vendedor', lojaId: 'loja-a' }, pedido), true)
    assert.equal(podeCancelarPedido({ id: 'vend-2', papel: 'vendedor', lojaId: 'loja-a' }, pedido), false)
    assert.equal(podeCancelarPedido({ id: 'vend-1', papel: 'vendedor', lojaId: 'loja-b' }, pedido), false)
  })

  test('mecânico não cancela; pedido não pendente ninguém cancela', () => {
    assert.equal(podeCancelarPedido({ id: 'x', papel: 'mecanico', lojaId: 'loja-a' }, pedido), false)
    assert.equal(podeCancelarPedido({ id: 'x', papel: 'admin_geral', lojaId: null }, { ...pedido, status: 'efetivado' }), false)
  })
})

describe('motivoBloqueioCriarPedido', () => {
  test('montada ou em garantia, disponível e sem transferência: pode', () => {
    assert.equal(motivoBloqueioCriarPedido({ status: 'montada', disponibilidade: 'disponivel' }, false), null)
    assert.equal(motivoBloqueioCriarPedido({ status: 'em_garantia', disponibilidade: 'disponivel' }, false), null)
  })

  test('caixa, vendida, reservada, aguardando aprovação ou com transferência: não pode', () => {
    assert.match(motivoBloqueioCriarPedido({ status: 'caixa', disponibilidade: null }, false)!, /montada/)
    assert.match(motivoBloqueioCriarPedido({ status: 'vendida', disponibilidade: null }, false)!, /vendida/)
    assert.match(motivoBloqueioCriarPedido({ status: 'montada', disponibilidade: 'reservada' }, false)!, /não está disponível/)
    assert.match(motivoBloqueioCriarPedido({ status: 'montada', disponibilidade: 'aguardando_aprovacao' }, false)!, /não está disponível/)
    assert.match(motivoBloqueioCriarPedido({ status: 'montada', disponibilidade: 'disponivel' }, true)!, /transferência/)
  })
})

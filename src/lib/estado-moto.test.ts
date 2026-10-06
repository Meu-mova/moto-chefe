import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motivoBloqueioPorVenda, motivoBloqueioPedidoAprovacao, type VendaVinculada } from './estado-moto'

// A venda que estragou a LYDAE3936T1207627: efetivada em 20/08 e já faturada.
const VENDA_FATURADA: VendaVinculada = { numero: 31118, notaFiscalSaida: '2263' }
const VENDA_SEM_NF: VendaVinculada = { numero: 31200, notaFiscalSaida: null }

test('moto vendida não volta a ser montada — o bug da LYDAE3936T1207627', () => {
  // 24/08: a moto foi remontada quatro dias depois de vendida e faturada, e
  // voltou pro Showroom como disponível. Isso tem que ser recusado.
  const motivo = motivoBloqueioPorVenda(VENDA_FATURADA, { status: 'montada' })
  assert.notEqual(motivo, null)
})

test('o motivo cita o número da venda', () => {
  // Sem o número, o operador não sabe o que aconteceu e procura outro caminho
  // pra forçar a montagem — foi exatamente assim que o estado foi corrompido.
  assert.match(motivoBloqueioPorVenda(VENDA_FATURADA, { status: 'montada' })!, /31118/)
})

test('devolver a moto ao showroom como disponível é bloqueado', () => {
  assert.notEqual(motivoBloqueioPorVenda(VENDA_FATURADA, { disponibilidade: 'disponivel' }), null)
})

test('voltar o status para caixa é bloqueado', () => {
  // O passo silencioso de 24/08: 'vendida' → 'caixa' via editarMotoAction.
  assert.notEqual(motivoBloqueioPorVenda(VENDA_FATURADA, { status: 'caixa' }), null)
})

test('moto sem venda é livre para montar', () => {
  assert.equal(motivoBloqueioPorVenda(null, { status: 'montada' }), null)
})

test('editar dados que não são de estoque continua liberado', () => {
  // Corrigir cor/chassi/motor de uma moto vendida é legítimo.
  assert.equal(motivoBloqueioPorVenda(VENDA_FATURADA, {}), null)
})

test('manter o estado vendido é permitido', () => {
  // Não pode travar a própria correção nem a confirmação de NF de saída.
  assert.equal(
    motivoBloqueioPorVenda(VENDA_FATURADA, { status: 'vendida', disponibilidade: 'vendida' }),
    null,
  )
})

test('antes da NF de saída, disponibilidade nula é o estado correto', () => {
  // criarVendaTx deixa status='vendida' + disponibilidade=NULL até a NF sair.
  assert.equal(
    motivoBloqueioPorVenda(VENDA_SEM_NF, { status: 'vendida', disponibilidade: null }),
    null,
  )
})

// ─── Pedido de aprovação de venda ────────────────────────────────────────────

test('moto reservada pode ir para aprovação', () => {
  // Finalizar reserva que precisa de aprovação parte sempre de moto 'reservada'.
  assert.equal(motivoBloqueioPedidoAprovacao({ status: 'montada', disponibilidade: 'reservada' }), null)
})

test('moto disponível pode ir para aprovação', () => {
  assert.equal(motivoBloqueioPedidoAprovacao({ status: 'montada', disponibilidade: 'disponivel' }), null)
})

test('moto na caixa não vai para aprovação', () => {
  assert.notEqual(motivoBloqueioPedidoAprovacao({ status: 'caixa', disponibilidade: null }), null)
})

test('moto vendida não vai para aprovação', () => {
  assert.notEqual(motivoBloqueioPedidoAprovacao({ status: 'vendida', disponibilidade: null }), null)
})

test('moto com pedido pendente não ganha um segundo pedido', () => {
  assert.notEqual(
    motivoBloqueioPedidoAprovacao({ status: 'montada', disponibilidade: 'aguardando_aprovacao' }),
    null,
  )
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmacaoValida, motivoQueImpedeRemover, recusaDaRemocao, SEM_IMPEDIMENTO, type ImpedimentosDeRemover } from './remover-moto-regras'

const com = (p: Partial<ImpedimentosDeRemover>): ImpedimentosDeRemover => ({ ...SEM_IMPEDIMENTO, ...p })

test('moto que nunca passou pelo comercial nem pelo financeiro pode ser removida', () => {
  assert.equal(motivoQueImpedeRemover(SEM_IMPEDIMENTO), null)
})

test('cada impedimento recusa com a frase que diz o que fazer', () => {
  assert.equal(motivoQueImpedeRemover(com({ temVenda: true })), 'Esta moto tem venda. Cancele a venda antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ aprovacaoPendente: true })), 'Esta moto tem venda aguardando aprovação. Aprove ou recuse antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ pedidoPendente: true })), 'Esta moto tem pedido de venda em aberto. Cancele o pedido antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ reservaAtiva: true })), 'Esta moto tem reserva em aberto. Cancele a reserva antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ pedidoComPix: true })), 'Um PIX recebido está ligado ao pedido desta moto. Remova a correspondência em PIX antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ osComDinheiro: { numero: 812 } })), 'A OS nº 812 tem dinheiro lançado (caixa, cartão ou PIX). Moto que passou pelo financeiro não se remove.')
  assert.equal(motivoQueImpedeRemover(com({ osComDinheiro: { numero: null } })), 'Uma OS desta moto tem dinheiro lançado (caixa, cartão ou PIX). Moto que passou pelo financeiro não se remove.')
})

test('com mais de um impedimento, a venda vem primeiro', () => {
  assert.equal(motivoQueImpedeRemover(com({ reservaAtiva: true, temVenda: true })), 'Esta moto tem venda. Cancele a venda antes de remover.')
})

test('a confirmação é a palavra CONFIRMAR, em maiúsculas', () => {
  assert.equal(confirmacaoValida('CONFIRMAR'), true)
  assert.equal(confirmacaoValida('  CONFIRMAR '), true)
  assert.equal(confirmacaoValida('confirmar'), false)
  assert.equal(confirmacaoValida(''), false)
})

const livre = { chassi: 'C1', impedimentos: SEM_IMPEDIMENTO }

test('o lote recusa sem motivo, sem confirmação, sem moto ou com uma moto impedida', () => {
  assert.equal(recusaDaRemocao({ motivo: ' ', confirmacao: 'CONFIRMAR', motos: [livre] }), 'Escreva o motivo da remoção.')
  assert.equal(recusaDaRemocao({ motivo: 'NF errada', confirmacao: 'confirmar', motos: [livre] }), 'Digite CONFIRMAR para remover.')
  assert.equal(recusaDaRemocao({ motivo: 'NF errada', confirmacao: 'CONFIRMAR', motos: [] }), 'Escolha ao menos uma moto.')
  assert.equal(
    recusaDaRemocao({ motivo: 'NF errada', confirmacao: 'CONFIRMAR', motos: [livre, { chassi: 'C2', impedimentos: com({ temVenda: true }) }] }),
    'C2: Esta moto tem venda. Cancele a venda antes de remover.',
  )
  assert.equal(recusaDaRemocao({ motivo: 'NF errada', confirmacao: 'CONFIRMAR', motos: [livre] }), null)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmacaoValida, motivoQueImpedeRemover, primeiraOsComDinheiro, recusaDaRemocao, SEM_IMPEDIMENTO, type ImpedimentosDeRemover } from './remover-moto-regras'

const com = (p: Partial<ImpedimentosDeRemover>): ImpedimentosDeRemover => ({ ...SEM_IMPEDIMENTO, ...p })

test('moto que nunca passou pelo comercial nem pelo financeiro pode ser removida', () => {
  assert.equal(motivoQueImpedeRemover(SEM_IMPEDIMENTO), null)
})

test('cada impedimento recusa com a frase que diz o que fazer', () => {
  assert.equal(motivoQueImpedeRemover(com({ temVenda: true })), 'Esta moto tem venda. Cancele a venda antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ marcadaVendida: true })), 'Esta moto está marcada como vendida, com venda fora do MOVA. Moto vendida não se remove.')
  assert.equal(motivoQueImpedeRemover(com({ temGarantia: true })), 'Esta moto tem garantia registrada. Moto com garantia não se remove.')
  assert.equal(motivoQueImpedeRemover(com({ aprovacaoPendente: true })), 'Esta moto tem venda aguardando aprovação. Aprove ou recuse antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ pedidoPendente: true })), 'Esta moto tem pedido de venda em aberto. Cancele o pedido antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ reservaAtiva: true })), 'Esta moto tem reserva em aberto. Cancele a reserva antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ pedidoComPix: true })), 'Um PIX recebido está ligado ao pedido desta moto. Remova a correspondência em PIX antes de remover.')
  assert.equal(motivoQueImpedeRemover(com({ osComDinheiro: { numero: 812 } })), 'A OS nº 812 tem pagamento registrado. Moto que passou pelo financeiro não se remove.')
  assert.equal(motivoQueImpedeRemover(com({ osComDinheiro: { numero: null } })), 'Uma OS desta moto tem pagamento registrado. Moto que passou pelo financeiro não se remove.')
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

const os = (o: Partial<Parameters<typeof primeiraOsComDinheiro>[0][number]>) =>
  ({ numero: 1, formaPagamento: null, pagamentos: null, valorTotal: null, financeiro: false, ...o })

test('OS com pagamento registrado tem dinheiro, mesmo sem caixa nem conciliação; sem pagamento, gratuita ou cortesia, não', () => {
  // Cartão e PIX só ficam na OS até a conciliação; só o dinheiro vai ao caixa (pagamento-os.ts).
  assert.deepEqual(primeiraOsComDinheiro([os({ numero: 7, pagamentos: [{ tipo: 'cartao_credito', valor: 100 }], valorTotal: '100' })]), { numero: 7 })
  // Formato antigo: só a forma em texto.
  assert.deepEqual(primeiraOsComDinheiro([os({ numero: 8, formaPagamento: 'PIX', valorTotal: '80' })]), { numero: 8 })
  // Caixa, cartão ou PIX ligado à OS, ou pagamento aguardando aprovação: vem do banco em `financeiro`.
  assert.deepEqual(primeiraOsComDinheiro([os({ numero: 9, financeiro: true })]), { numero: 9 })
  // Montagem com itens somados (valor_total > 0) e nenhum pagamento: não é dinheiro.
  assert.equal(primeiraOsComDinheiro([os({ valorTotal: '120' })]), null)
  assert.equal(primeiraOsComDinheiro([os({ formaPagamento: 'Gratuita', valorTotal: '0' })]), null)
  assert.equal(primeiraOsComDinheiro([os({ formaPagamento: 'Cortesia / Garantia', valorTotal: '150' })]), null)
  assert.equal(primeiraOsComDinheiro([]), null)
})

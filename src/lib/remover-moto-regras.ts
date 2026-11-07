// Regras do Remover moto (#692; ADR-0020 com o adendo de 07/11/2026): puras, usadas pelo diálogo e pelo servidor.
import { motivoDoArquivoValido } from '@/lib/arquivar-moto-regras'

/**
 * O que mostra que a moto já passou pelo comercial ou pelo financeiro. Remover é só para a moto
 * que nunca devia ter entrado; a errada que chegou a ser vendida sai pelo Cancelar venda antes.
 */
export type ImpedimentosDeRemover = {
  temVenda: boolean
  aprovacaoPendente: boolean
  pedidoPendente: boolean
  reservaAtiva: boolean
  /** PIX ligado a um pedido da moto, mesmo cancelado: apagar o pedido mexeria no financeiro. */
  pedidoComPix: boolean
  /** OS da moto com lançamento de caixa, cartão ou PIX. */
  osComDinheiro: { numero: number | null } | null
}

export const SEM_IMPEDIMENTO: ImpedimentosDeRemover = {
  temVenda: false, aprovacaoPendente: false, pedidoPendente: false, reservaAtiva: false, pedidoComPix: false, osComDinheiro: null,
}

const FINANCEIRO = 'tem dinheiro lançado (caixa, cartão ou PIX). Moto que passou pelo financeiro não se remove.'

// Ordem da lista = ordem da frase mostrada: a venda primeiro, porque a saída dela é o Cancelar venda.
const RECUSAS: [(i: ImpedimentosDeRemover) => boolean, (i: ImpedimentosDeRemover) => string][] = [
  [i => i.temVenda, () => 'Esta moto tem venda. Cancele a venda antes de remover.'],
  [i => i.aprovacaoPendente, () => 'Esta moto tem venda aguardando aprovação. Aprove ou recuse antes de remover.'],
  [i => i.pedidoPendente, () => 'Esta moto tem pedido de venda em aberto. Cancele o pedido antes de remover.'],
  [i => i.reservaAtiva, () => 'Esta moto tem reserva em aberto. Cancele a reserva antes de remover.'],
  [i => i.pedidoComPix, () => 'Um PIX recebido está ligado ao pedido desta moto. Remova a correspondência em PIX antes de remover.'],
  [i => i.osComDinheiro !== null, i => i.osComDinheiro?.numero != null ? `A OS nº ${i.osComDinheiro.numero} ${FINANCEIRO}` : `Uma OS desta moto ${FINANCEIRO}`],
]

export function motivoQueImpedeRemover(i: ImpedimentosDeRemover): string | null {
  const recusa = RECUSAS.find(([trava]) => trava(i))
  return recusa ? recusa[1](i) : null
}

export const PALAVRA_DE_CONFIRMACAO = 'CONFIRMAR'

export const confirmacaoValida = (texto: string): boolean => texto.trim() === PALAVRA_DE_CONFIRMACAO

/** Recusa o lote inteiro se faltar motivo, confirmação ou moto, ou se uma delas estiver impedida. */
export function recusaDaRemocao(lote: { motivo: string; confirmacao: string; motos: { chassi: string; impedimentos: ImpedimentosDeRemover }[] }): string | null {
  if (!motivoDoArquivoValido(lote.motivo)) return 'Escreva o motivo da remoção.'
  if (!confirmacaoValida(lote.confirmacao)) return `Digite ${PALAVRA_DE_CONFIRMACAO} para remover.`
  if (lote.motos.length === 0) return 'Escolha ao menos uma moto.'
  const impedida = lote.motos
    .map(m => ({ chassi: m.chassi, motivo: motivoQueImpedeRemover(m.impedimentos) }))
    .find(m => m.motivo !== null)
  return impedida ? `${impedida.chassi}: ${impedida.motivo}` : null
}

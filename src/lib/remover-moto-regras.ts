// Regras do Remover moto (#692; ADR-0020 com o adendo de 07/11/2026): puras, usadas pelo diálogo e pelo servidor.
import { motivoDoArquivoValido } from '@/lib/arquivar-moto-regras'
import { pagamentosEfetivosOS } from '@/lib/conciliacao-status'
import { primeiraRecusa, recusaDasMotos, type Recusa } from '@/lib/recusa-de-motos'

/**
 * O que mostra que a moto já passou pelo comercial ou pelo financeiro. Remover é só para a moto
 * que nunca devia ter entrado; a errada que chegou a ser vendida sai pelo Cancelar venda antes.
 */
export type ImpedimentosDeRemover = {
  temVenda: boolean
  /** Marcada vendida sem linha em vendas: venda pelo Bling ou golpe (#544). */
  marcadaVendida: boolean
  temGarantia: boolean
  aprovacaoPendente: boolean
  pedidoPendente: boolean
  reservaAtiva: boolean
  /** PIX ligado a um pedido da moto, mesmo cancelado: apagar o pedido mexeria no financeiro. */
  pedidoComPix: boolean
  /** OS da moto com pagamento registrado, lançado no caixa, conciliado ou aguardando aprovação. */
  osComDinheiro: { numero: number | null } | null
}

export const SEM_IMPEDIMENTO: ImpedimentosDeRemover = {
  temVenda: false, marcadaVendida: false, temGarantia: false, aprovacaoPendente: false, pedidoPendente: false, reservaAtiva: false, pedidoComPix: false, osComDinheiro: null,
}

const FINANCEIRO = 'tem pagamento registrado. Moto que passou pelo financeiro não se remove.'

// Ordem da lista = ordem da frase mostrada: a venda primeiro, porque a saída dela é o Cancelar venda.
const RECUSAS: Recusa<ImpedimentosDeRemover>[] = [
  [i => i.temVenda, () => 'Esta moto tem venda. Cancele a venda antes de remover.'],
  [i => i.marcadaVendida, () => 'Esta moto está marcada como vendida, com venda fora do MOVA. Moto vendida não se remove.'],
  [i => i.temGarantia, () => 'Esta moto tem garantia registrada. Moto com garantia não se remove.'],
  [i => i.aprovacaoPendente, () => 'Esta moto tem venda aguardando aprovação. Aprove ou recuse antes de remover.'],
  [i => i.pedidoPendente, () => 'Esta moto tem pedido de venda em aberto. Cancele o pedido antes de remover.'],
  [i => i.reservaAtiva, () => 'Esta moto tem reserva em aberto. Cancele a reserva antes de remover.'],
  [i => i.pedidoComPix, () => 'Um PIX recebido está ligado ao pedido desta moto. Remova a correspondência em PIX antes de remover.'],
  [i => i.osComDinheiro !== null, i => i.osComDinheiro?.numero != null ? `A OS nº ${i.osComDinheiro.numero} ${FINANCEIRO}` : `Uma OS desta moto ${FINANCEIRO}`],
]

export const motivoQueImpedeRemover = (i: ImpedimentosDeRemover): string | null => primeiraRecusa(RECUSAS, i)

export const PALAVRA_DE_CONFIRMACAO = 'CONFIRMAR'

export const confirmacaoValida = (texto: string): boolean => texto.trim() === PALAVRA_DE_CONFIRMACAO

/** Recusa o lote inteiro se faltar motivo, confirmação ou moto, ou se uma delas estiver impedida. */
export function recusaDaRemocao(lote: { motivo: string; confirmacao: string; motos: { chassi: string; pendencias: ImpedimentosDeRemover }[] }): string | null {
  if (!motivoDoArquivoValido(lote.motivo)) return 'Escreva o motivo da remoção.'
  if (!confirmacaoValida(lote.confirmacao)) return `Digite ${PALAVRA_DE_CONFIRMACAO} para remover.`
  return recusaDasMotos(lote.motos, motivoQueImpedeRemover)
}

/** OS da moto como o banco devolve; `financeiro` = caixa, cartão ou PIX ligado a ela, ou pagamento aguardando aprovação. */
export type OsDaMoto = { numero: number | null; formaPagamento: string | null; pagamentos: unknown; valorTotal: string | number | null; financeiro: boolean }

// Formas que não recebem dinheiro (os tipos de pagamentosEfetivosOS).
const SEM_COBRANCA = ['gratuita', 'cortesia']

// Cartão, PIX e transferência ficam só na OS até a conciliação; só o dinheiro vai ao caixa (pagamento-os.ts).
const temDinheiro = (os: OsDaMoto): boolean =>
  os.financeiro || pagamentosEfetivosOS(os.formaPagamento, os.pagamentos, os.valorTotal == null ? null : String(os.valorTotal))
    .some(p => !SEM_COBRANCA.includes(p.tipo) && Number(p.valor) > 0)

export function primeiraOsComDinheiro(oss: OsDaMoto[]): { numero: number | null } | null {
  const os = oss.find(temDinheiro)
  return os ? { numero: os.numero } : null
}

/** O que sai junto com a moto, por tipo; as chaves são as mesmas que o log grava em `saiu`. */
export type SaiJunto = Partial<Record<'os' | 'itensDeOs' | 'transferencias' | 'cupons' | 'reservas' | 'pedidos' | 'aprovacoes' | 'historico', number>>

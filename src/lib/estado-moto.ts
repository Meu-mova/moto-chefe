// src/lib/estado-moto.ts
export type Status = 'caixa' | 'montada' | 'em_garantia'
export type Disponibilidade = 'disponivel' | 'reservada' | 'vendida' | 'aguardando_aprovacao'
type Papel = 'admin_geral' | 'admin_socio' | 'aux_adm' | 'vendedor' | 'mecanico' | 'motorista'

const isAdmin = (p: Papel) => p === 'admin_geral' || p === 'admin_socio'

// Transições de status físico (Aux Adm + Admin)
const transicoesNormais: Partial<Record<Status, Status[]>> = {
  caixa:       ['montada'],
  montada:     ['em_garantia'],
  em_garantia: ['montada'],
}

// Transições de correção (Admin apenas)
const transicoesCorrecao: Partial<Record<Status, Status[]>> = {
  montada: ['caixa'],
}

export function getTransicoesStatusPermitidas(
  statusAtual: Status,
  papel: Papel,
  isMinhaLoja: boolean
): Status[] {
  if (!isMinhaLoja && !isAdmin(papel)) return []

  if (isAdmin(papel)) {
    return [
      ...(transicoesNormais[statusAtual] ?? []),
      ...(transicoesCorrecao[statusAtual] ?? []),
    ]
  }

  if (papel === 'aux_adm') {
    return transicoesNormais[statusAtual] ?? []
  }

  return []
}

// Transições de disponibilidade (Aux Adm + Admin, apenas motos montadas)
export function getTransicoesDisponibilidadePermitidas(
  statusAtual: Status,
  dispAtual: Disponibilidade | null,
  papel: Papel,
  isMinhaLoja: boolean
): Disponibilidade[] {
  if (statusAtual !== 'montada') return []
  if (!isAdmin(papel)) return []
  if (dispAtual === 'vendida') return []

  if (dispAtual === null) return ['disponivel']
  if (dispAtual === 'disponivel') return ['reservada']
  if (dispAtual === 'reservada') return ['disponivel']
  return []
}

// ─── Trava: moto com venda registrada não volta a ser estoque ────────────────
//
// Em 24/08/2026 a JetMax LYDAE3936T1207627 foi remontada quatro dias depois de
// vendida e faturada, e reapareceu no Showroom como disponível — pronta pra ser
// vendida de novo. As transições acima não pegam esse caso: elas olham só o
// motos.status, e o status já tinha sido revertido para 'caixa' por fora. A
// fonte da verdade de "esta moto saiu" é a tabela vendas, não o status.

/** O que a trava precisa saber da venda não cancelada vinculada à moto. */
export type VendaVinculada = { numero: number; notaFiscalSaida: string | null }

/**
 * Retorna o motivo pelo qual esta alteração de estoque deve ser recusada, ou
 * null se ela é permitida. `alteracao` traz só os campos que estão sendo
 * mexidos — chave ausente significa "não estou tocando nisso".
 */
export function motivoBloqueioPorVenda(
  venda: VendaVinculada | null,
  alteracao: { status?: string; disponibilidade?: string | null },
): string | null {
  if (!venda) return null

  const mexeEmStatus = alteracao.status !== undefined
  const mexeEmDisponibilidade = alteracao.disponibilidade !== undefined
  if (!mexeEmStatus && !mexeEmDisponibilidade) return null

  // O estado correto de uma moto vendida: status 'vendida', e disponibilidade
  // nula até a NF de saída sair, 'vendida' depois dela. Escrever esse mesmo
  // estado é permitido — senão a trava impediria a confirmação de NF e a
  // própria correção de uma moto que ficou com o estado torto.
  const statusOk = !mexeEmStatus || alteracao.status === 'vendida'
  const disponibilidadeEsperada = venda.notaFiscalSaida ? 'vendida' : null
  const disponibilidadeOk =
    !mexeEmDisponibilidade || alteracao.disponibilidade === disponibilidadeEsperada
  if (statusOk && disponibilidadeOk) return null

  return `Moto já vendida na venda nº ${venda.numero} — não pode voltar ao estoque. Se a venda foi um engano, cancele a venda primeiro; o cancelamento devolve a moto ao Showroom.`
}

/**
 * Motivo pelo qual a moto não pode receber um pedido de aprovação de venda, ou
 * null se pode. Moto 'reservada' é aceita de propósito: é assim que se finaliza
 * uma reserva abaixo do mínimo ou com transferência. A aprovação converte a
 * reserva ativa (criarVendaTx) e a recusa devolve a moto a 'reservada'.
 */
export function motivoBloqueioPedidoAprovacao(
  moto: { status: string; disponibilidade: string | null },
): string | null {
  if (moto.status === 'caixa') return 'Moto ainda não foi montada — não pode ser vendida'
  if (moto.status === 'vendida') return 'Moto já foi vendida'
  if (moto.disponibilidade === 'aguardando_aprovacao') return 'Esta moto já tem uma venda aguardando aprovação'
  return null
}

/**
 * Motivo pelo qual a reserva da moto não pode ser cancelada agora, ou null se
 * pode. Com venda aguardando aprovação, o pedido pode ter saído da própria
 * reserva: cancelar no meio deixa a recusa devolvendo a moto a 'reservada' sem
 * reserva ativa, e a aprovação gerando venda sem reserva_id que ainda lança a
 * entrada da reserva cancelada.
 */
export function motivoBloqueioCancelarReserva(
  moto: { disponibilidade: string | null },
): string | null {
  if (moto.disponibilidade === 'aguardando_aprovacao') {
    return 'Esta moto tem uma venda aguardando aprovação — a venda precisa ser aprovada ou recusada antes de cancelar a reserva'
  }
  return null
}

export const statusLabel: Record<Status, string> = {
  caixa:       'Caixa',
  montada:     'Montada',
  em_garantia: 'Garantia',
}

export const disponibilidadeLabel: Record<Disponibilidade, string> = {
  disponivel:            'Disponível',
  reservada:             'Reservada',
  vendida:               'Vendida',
  aguardando_aprovacao:  'Aguardando aprovação',
}

// Compat: usado em lugares que ainda esperam a string antiga
export const statusLabel_legado: Record<string, string> = {
  faturada:    'Caixa',
  caixa:       'Caixa',
  montada:     'Montada',
  disponivel:  'Disponível',
  reservada:   'Reservada',
  em_garantia: 'Garantia',
  vendida:     'Vendida',
}

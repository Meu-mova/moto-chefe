// src/lib/estado-moto.ts
export type Status = 'caixa' | 'montada' | 'em_garantia'
export type Disponibilidade = 'disponivel' | 'reservada' | 'vendida'
type Papel = 'admin_geral' | 'admin_socio' | 'aux_adm' | 'vendedor' | 'mecanico'

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
  if (!isMinhaLoja && !isAdmin(papel)) return []
  if (!isAdmin(papel) && papel !== 'aux_adm') return []
  if (dispAtual === 'vendida') return []

  if (dispAtual === null) return ['disponivel']
  if (dispAtual === 'disponivel') return ['reservada']
  if (dispAtual === 'reservada') return ['disponivel']
  return []
}

export const statusLabel: Record<Status, string> = {
  caixa:       'Caixa',
  montada:     'Montada',
  em_garantia: 'Garantia',
}

export const disponibilidadeLabel: Record<Disponibilidade, string> = {
  disponivel: 'Disponível',
  reservada:  'Reservada',
  vendida:    'Vendida',
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

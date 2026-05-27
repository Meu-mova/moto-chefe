// src/lib/estado-moto.ts
export type Status = 'faturada' | 'montada' | 'disponivel' | 'reservada' | 'em_garantia' | 'vendida'
type Papel = 'admin_geral' | 'aux_adm' | 'vendedor' | 'mecanico'

// Transições normais (Aux Adm)
const transicoesNormais: Partial<Record<Status, Status[]>> = {
  faturada:    ['montada', 'em_garantia'],
  montada:     ['disponivel', 'em_garantia'],
  disponivel:  ['em_garantia'],
  em_garantia: [],
}

// Transições de correção (Admin Geral apenas)
const transicoesCorrecao: Partial<Record<Status, Status[]>> = {
  montada:     ['faturada'],
  disponivel:  ['montada'],
  em_garantia: ['montada'],
}

export function getTransicoesPermitidas(
  statusAtual: Status,
  papel: Papel,
  isMinhaLoja: boolean
): Status[] {
  if (!isMinhaLoja && papel !== 'admin_geral') return []

  if (papel === 'admin_geral') {
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

export const statusLabel: Record<Status, string> = {
  faturada:    'Faturada',
  montada:     'Montada',
  disponivel:  'Disponível',
  reservada:   'Reservada',
  em_garantia: 'Em Garantia',
  vendida:     'Vendida',
}

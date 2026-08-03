// Regras de cálculo da folha de pagamento.
//
// A base da comissão não é derivável do papel: vários aux_adm recebem um
// percentual sobre o total da LOJA (Charles, 1,5% das motos de Pouso Alegre),
// enquanto outros recebem sobre o que eles mesmos venderam (Tiago, 0,5% das
// motos dele). Por isso a base é configurada por pessoa.

export const BASES_COMISSAO = [
  { valor: 'padrao',         label: 'Padrão (pelo papel)' },
  { valor: 'proprias_motos', label: 'Motos vendidas por ele' },
  { valor: 'loja_motos',     label: 'Motos da loja' },
  { valor: 'loja_pecas',     label: 'Peças da loja' },
] as const

export type BaseComissao = (typeof BASES_COMISSAO)[number]['valor']

export const BASES_COMISSAO_VALIDAS: readonly string[] = BASES_COMISSAO.map(b => b.valor)

export function isBaseComissao(v: string): v is BaseComissao {
  return BASES_COMISSAO_VALIDAS.includes(v)
}

export const TIPOS_AJUSTE = [
  { valor: 'motos',    label: 'Motos' },
  { valor: 'pecas',    label: 'Peças' },
  { valor: 'servicos', label: 'Serviços (mão de obra)' },
] as const

export type TipoAjuste = (typeof TIPOS_AJUSTE)[number]['valor']

export const TIPOS_AJUSTE_VALIDOS: readonly string[] = TIPOS_AJUSTE.map(t => t.valor)

export function isTipoAjuste(v: string): v is TipoAjuste {
  return TIPOS_AJUSTE_VALIDOS.includes(v)
}

export type TotaisBase = {
  /** motos vendidas pela própria pessoa (líquido de cartão) */
  propriasMotos: number
  /** peças vendidas pela própria pessoa (avulsas + peças das OS que ela abriu) */
  propriasPecas: number
  /** mão de obra das OS concluídas em que a pessoa foi o mecânico */
  propriosServicos: number
  /** motos vendidas pela loja da pessoa */
  lojaMotos: number
  /** peças vendidas pela loja da pessoa */
  lojaPecas: number
}

/**
 * Base sobre a qual a comissão incide. `padrao` reproduz o comportamento
 * histórico, derivado do papel principal.
 */
export function resolverBaseComissao(
  baseComissao: string,
  papel: string,
  totais: TotaisBase,
): number {
  switch (baseComissao) {
    case 'proprias_motos': return totais.propriasMotos
    case 'loja_motos':     return totais.lojaMotos
    case 'loja_pecas':     return totais.lojaPecas
    case 'padrao':
    default:
      if (papel === 'vendedor') return totais.propriasMotos
      if (papel === 'mecanico') return totais.propriosServicos
      if (papel === 'aux_adm')  return totais.propriasPecas
      return 0
  }
}

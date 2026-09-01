// Regras de cálculo da folha de pagamento.
//
// A base não é derivável do papel: vários aux_adm recebem um percentual sobre o
// total da LOJA (Charles, 1,5% das motos de Pouso Alegre), enquanto outros recebem
// sobre o que eles mesmos venderam (Tiago, 0,5% das motos dele). Por isso a base é
// configurada por pessoa.
//
// Desde 01/09/2026 cada pessoa pode ter VÁRIAS regras, cada uma marcada como
// comissão ou premiação — a Julia Sampaio recebe 5% sobre as peças que vende e
// 0,2% sobre as motos da loja dela. Antes era uma regra só por pessoa, e o que
// existia foi migrado para uma regra de comissão (migração 0076).

export const BASES_COMISSAO = [
  { valor: 'padrao',            label: 'Padrão (pelo papel)' },
  { valor: 'proprias_motos',    label: 'Motos vendidas por ele' },
  { valor: 'proprias_pecas',    label: 'Peças vendidas por ele' },
  { valor: 'proprios_servicos', label: 'Mão de obra das OS dele' },
  { valor: 'loja_motos',        label: 'Motos da loja' },
  { valor: 'loja_pecas',        label: 'Peças da loja' },
  { valor: 'loja_servicos',     label: 'Mão de obra das OS da loja' },
  { valor: 'loja_total',        label: 'Tudo que a loja vendeu' },
] as const

export type BaseComissao = (typeof BASES_COMISSAO)[number]['valor']

export const BASES_COMISSAO_VALIDAS: readonly string[] = BASES_COMISSAO.map(b => b.valor)

export function isBaseComissao(v: string): v is BaseComissao {
  return BASES_COMISSAO_VALIDAS.includes(v)
}

export function labelDaBase(base: string): string {
  return BASES_COMISSAO.find(b => b.valor === base)?.label ?? base
}

export const TIPOS_REGRA = [
  { valor: 'comissao',  label: 'Comissão' },
  { valor: 'premiacao', label: 'Premiação' },
] as const

export type TipoRegra = (typeof TIPOS_REGRA)[number]['valor']

export function isTipoRegra(v: string): v is TipoRegra {
  return v === 'comissao' || v === 'premiacao'
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
  /** mão de obra das OS concluídas na loja da pessoa */
  lojaServicos: number
}

/**
 * Valor sobre o qual o percentual incide.
 *
 * `padrao` reproduz o comportamento histórico, derivado do papel principal — é o
 * que as regras migradas usam, e por isso continua existindo mesmo com as bases
 * explícitas disponíveis.
 */
export function resolverBaseComissao(
  baseComissao: string,
  papel: string,
  totais: TotaisBase,
): number {
  switch (baseComissao) {
    case 'proprias_motos':    return totais.propriasMotos
    case 'proprias_pecas':    return totais.propriasPecas
    case 'proprios_servicos': return totais.propriosServicos
    case 'loja_motos':        return totais.lojaMotos
    case 'loja_pecas':        return totais.lojaPecas
    case 'loja_servicos':     return totais.lojaServicos
    case 'loja_total':        return totais.lojaMotos + totais.lojaPecas + totais.lojaServicos
    case 'padrao':
    default:
      if (papel === 'vendedor') return totais.propriasMotos
      if (papel === 'mecanico') return totais.propriosServicos
      if (papel === 'aux_adm')  return totais.propriasPecas
      return 0
  }
}

export type RegraFolha = {
  id: string
  usuarioId: string
  tipo: string
  base: string
  percentual: string
  /** 'YYYY-MM'. NULL = sempre valeu — é o que as regras migradas recebem, para não
   *  mudar nenhuma folha já fechada. */
  vigenciaInicio: string | null
  /** 'YYYY-MM' inclusive. NULL = sem fim. */
  vigenciaFim: string | null
  descricao: string | null
}

/**
 * A regra vale no mês pedido?
 *
 * Meses em 'YYYY-MM' são comparados como texto — ordenam igual à data e não pegam
 * fuso, mesmo motivo de folhaAjustesBase.mes.
 */
export function regraVigenteNoMes(regra: RegraFolha, mes: string): boolean {
  if (regra.vigenciaInicio && mes < regra.vigenciaInicio) return false
  if (regra.vigenciaFim && mes > regra.vigenciaFim) return false
  return true
}

export type RegraCalculada = {
  id: string
  tipo: string
  base: string
  percentual: number
  /** Valor sobre o qual o percentual incidiu. */
  valorBase: number
  /** percentual aplicado sobre valorBase. */
  valor: number
  descricao: string | null
}

export type ResultadoRegras = {
  comissao: number
  /** Só o que veio das regras percentuais. A premiação por faixa OTE é somada
   *  fora daqui, em agregarFolha — são dois mecanismos distintos. */
  premiacao: number
  /** Uma linha por regra vigente, na ordem em que foram passadas. Alimenta o
   *  detalhamento da tela e do impresso. */
  detalhes: RegraCalculada[]
}

/**
 * Aplica todas as regras vigentes de uma pessoa no mês.
 *
 * Regras do mesmo tipo somam: quem tem 5% sobre as peças dele e mais 1% sobre as
 * peças da loja recebe as duas coisas. Nada é deduplicado por base de propósito —
 * duas regras na mesma base é decisão de quem cadastrou, não erro a corrigir aqui.
 */
export function calcularRegrasFolha(
  regras: RegraFolha[],
  papel: string,
  totais: TotaisBase,
  mes: string,
): ResultadoRegras {
  const detalhes: RegraCalculada[] = []
  let comissao = 0
  let premiacao = 0

  for (const regra of regras) {
    if (!regraVigenteNoMes(regra, mes)) continue

    const percentual = parseFloat(regra.percentual) || 0
    const valorBase = resolverBaseComissao(regra.base, papel, totais)
    const valor = valorBase * (percentual / 100)

    detalhes.push({
      id: regra.id,
      tipo: regra.tipo,
      base: regra.base,
      percentual,
      valorBase,
      valor,
      descricao: regra.descricao,
    })

    if (regra.tipo === 'premiacao') premiacao += valor
    else comissao += valor
  }

  return { comissao, premiacao, detalhes }
}

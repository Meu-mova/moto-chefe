// Linhas da exportação para a assessoria contábil.
//
// O contador recebe o DRE fechado e precisa conferir de onde veio cada número.
// Uma lista crua de saídas não serve: compra de moto, retirada de sócio e
// transferência entre as empresas do grupo estão no extrato mas não são custo
// de operar a loja. Somando a coluna de valor ele chegaria a um total que não
// existe em lugar nenhum do sistema.
//
// Por isso cada linha diz se entra no resultado e, quando não entra, por quê —
// e a classificação sai da MESMA função que o card do /financeiro e o DRE usam
// (`motivoForaDoCalculo`), nunca de uma regra escrita de novo aqui.

import {
  motivoForaDoCalculo,
  valorDespesa,
  ROTULO_MOTIVO_FORA,
  type ConfigDespesas,
} from './despesas-operacionais'

/** As três fontes de despesa, como `fontesDespesaDoPeriodo` as entrega. */
export type FontesDespesa = {
  config: ConfigDespesas
  banco: {
    data: Date
    banco: string | null
    valor: string
    categoria: string | null
    favorecidoNome: string | null
    descricao: string | null
    lojaId: string | null
  }[]
  manuais: {
    data: string
    valor: string
    categoria: string
    descricao: string | null
    beneficiario: string | null
    banco: string | null
    formaPagamento: string | null
    lojaId: string | null
  }[]
  caixa: {
    data: string
    valor: string
    categoria: string
    descricao: string | null
    lojaId: string | null
  }[]
}

export type LinhaDespesaExport = {
  origem: 'Extrato bancário' | 'Lançamento manual' | 'Caixa da loja'
  data: string
  banco: string
  favorecido: string
  descricao: string
  categoria: string
  loja: string
  valor: number
  entraNoResultado: 'Sim' | 'Não'
  /** Vazio quando entra. Só a linha excluída carrega justificativa. */
  motivo: string
}

const SEM_CATEGORIA = 'Sem categoria'

/**
 * Data no formato brasileiro.
 *
 * O extrato guarda timestamp e o lançamento manual guarda texto "YYYY-MM-DD".
 * O texto é formatado sem passar pelo `Date`: "2026-08-05" vira meia-noite UTC,
 * que em Brasília é 21h do dia 4 — e a planilha mostraria o dia errado. O
 * timestamp é convertido no fuso de Brasília para bater com o que a tela mostra.
 */
function dataBr(valor: Date | string): string {
  if (typeof valor === 'string') {
    const [ano, mes, dia] = valor.slice(0, 10).split('-')
    return `${dia}/${mes}/${ano}`
  }
  return valor.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function linhasDespesa(
  fontes: FontesDespesa,
  nomeLoja: (lojaId: string | null) => string,
): LinhaDespesaExport[] {
  const { config } = fontes

  const classificar = (
    saida: { valor: string; categoria: string | null; favorecidoNome: string | null; descricao: string | null },
  ) => {
    const motivo = motivoForaDoCalculo(saida, config)
    return {
      entraNoResultado: (motivo ? 'Não' : 'Sim') as 'Sim' | 'Não',
      motivo: motivo ? ROTULO_MOTIVO_FORA[motivo] : '',
    }
  }

  const doBanco = fontes.banco.map((b): LinhaDespesaExport => ({
    origem: 'Extrato bancário',
    data: dataBr(b.data),
    banco: b.banco ?? '',
    favorecido: b.favorecidoNome ?? '',
    descricao: b.descricao ?? '',
    categoria: b.categoria ?? SEM_CATEGORIA,
    loja: nomeLoja(b.lojaId),
    valor: valorDespesa(b.valor),
    ...classificar(b),
  }))

  // Lançamento manual e caixa não têm favorecido nem histórico de extrato: só a
  // categoria pode tirá-los do cálculo, exatamente como no `somarDespesas`.
  const dosManuais = fontes.manuais.map((m): LinhaDespesaExport => ({
    origem: 'Lançamento manual',
    data: dataBr(m.data),
    banco: m.banco ?? m.formaPagamento ?? '',
    favorecido: m.beneficiario ?? '',
    descricao: m.descricao ?? '',
    categoria: m.categoria || SEM_CATEGORIA,
    loja: nomeLoja(m.lojaId),
    valor: valorDespesa(m.valor),
    ...classificar({ valor: m.valor, categoria: m.categoria, favorecidoNome: null, descricao: null }),
  }))

  const doCaixa = fontes.caixa.map((c): LinhaDespesaExport => {
    const fora = config.categoriasCaixaForaDoCalculo?.has(c.categoria) ?? false
    return {
      origem: 'Caixa da loja',
      data: dataBr(c.data),
      banco: 'Dinheiro (gaveta)',
      favorecido: '',
      descricao: c.descricao ?? '',
      categoria: c.categoria || SEM_CATEGORIA,
      loja: nomeLoja(c.lojaId),
      valor: valorDespesa(c.valor),
      entraNoResultado: fora ? 'Não' : 'Sim',
      motivo: fora ? ROTULO_MOTIVO_FORA.caixa_nao_despesa : '',
    }
  })

  return [...doBanco, ...dosManuais, ...doCaixa].sort((a, b) => {
    const [da, ma, aa] = a.data.split('/')
    const [dbb, mb, ab] = b.data.split('/')
    return `${aa}${ma}${da}`.localeCompare(`${ab}${mb}${dbb}`)
  })
}

/** Limite de meses por arquivo: o suficiente para um exercício inteiro. */
export const MAX_MESES_EXPORT = 12

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export type Competencia = { ano: number; mes: number }

/**
 * Os meses de "de" até "ate", inclusive. `null` quando o período não serve —
 * mês malformado, invertido ou maior que o teto.
 *
 * O teto não é capricho: a exportação lê venda, OS, peça e extrato do período
 * inteiro, e um pedido de "2020 até hoje" numa URL derruba o pooler.
 */
export function competenciasEntre(de: string, ate: string): Competencia[] | null {
  if (!MES_RE.test(de) || !MES_RE.test(ate)) return null
  const [anoDe, mesDe] = de.split('-').map(Number)
  const [anoAte, mesAte] = ate.split('-').map(Number)
  const primeiro = anoDe * 12 + (mesDe - 1)
  const ultimo = anoAte * 12 + (mesAte - 1)
  if (ultimo < primeiro) return null
  if (ultimo - primeiro + 1 > MAX_MESES_EXPORT) return null

  const saida: Competencia[] = []
  for (let i = primeiro; i <= ultimo; i++) {
    saida.push({ ano: Math.floor(i / 12), mes: (i % 12) + 1 })
  }
  return saida
}

// Helpers puros do relatório individual do vendedor (one-a-one). Sem banco.

/** Rótulo de posição no ranking, tratando empate. Entrada: contagens já ordenadas
 *  de forma decrescente. [33,33,22] → ['1º–2º','1º–2º','3º']. */
export function posicoes(valores: number[]): string[] {
  const out = new Array<string>(valores.length)
  let i = 0
  while (i < valores.length) {
    let j = i
    while (j + 1 < valores.length && valores[j + 1] === valores[i]) j++
    const rot = i === j ? `${i + 1}º` : `${i + 1}º–${j + 1}º`
    for (let k = i; k <= j; k++) out[k] = rot
    i = j + 1
  }
  return out
}

/** Tempo em segundos → rótulo curto ("45s", "18 min", "2,1 h"). */
export function tempoResposta(seg: number | null): string {
  if (seg == null) return '—'
  if (seg < 90) return `${Math.round(seg)}s`
  if (seg < 5400) return `${Math.round(seg / 60)} min`
  return `${(seg / 3600).toFixed(1).replace('.', ',')} h`
}

export type AtendVendedor = {
  leads: number
  comIncoming: number
  semResposta: number
  tempoRespSeg: number | null
  mensagens: number
  tarefas: number
  ganhos: number
  perdidos: number
  conversao: number
}

export type EntradaLeitura = {
  motos: number
  faturamento: number
  faturamentoAnterior: number
  atendimento: AtendVendedor | null
}

/**
 * Pontos fortes e oportunidades do vendedor — para a conversa individual.
 * Comparado à média do time (conversão em %, tempo de resposta em segundos).
 */
export function leitura(
  v: EntradaLeitura,
  media: { conversao: number; tempoRespSeg: number },
): { fortes: string[]; oportunidades: string[] } {
  const fortes: string[] = []
  const oportunidades: string[] = []
  const vs = v.faturamentoAnterior > 0
    ? Math.round(((v.faturamento - v.faturamentoAnterior) / v.faturamentoAnterior) * 100)
    : null

  if (vs != null && vs >= 50) fortes.push(`Cresceu ${vs}% sobre o mês anterior — em plena aceleração.`)
  if (vs != null && vs < 0) oportunidades.push(`Caiu ${Math.abs(vs)}% vs o mês anterior. Vale entender o que mudou e retomar.`)

  const a = v.atendimento
  if (a) {
    const respPct = a.comIncoming > 0 ? Math.round(((a.comIncoming - a.semResposta) / a.comIncoming) * 100) : null
    if (a.tempoRespSeg != null && a.tempoRespSeg < 600)
      fortes.push('Responde muito rápido — pega o lead quase na hora. Isso vende.')
    if (a.conversao >= media.conversao + 1)
      fortes.push(`Conversão de ${a.conversao.toFixed(1)}% acima da média do time (${media.conversao.toFixed(1)}%) — aproveita bem o lead.`)
    if (respPct != null && respPct >= 97)
      fortes.push(`Quase não deixa lead sem resposta (${respPct}% respondidos).`)
    if (a.tempoRespSeg != null && a.tempoRespSeg > 7200)
      oportunidades.push(`Tempo de resposta de ${tempoResposta(a.tempoRespSeg)} (média do time é ${tempoResposta(media.tempoRespSeg)}). Responder mais rápido tende a subir a conversão.`)
    if (a.conversao < media.conversao)
      oportunidades.push(`Conversão de ${a.conversao.toFixed(1)}% abaixo da média (${media.conversao.toFixed(1)}%). Muitos leads chegam — vale revisar a abordagem no fechamento.`)
    if (a.semResposta >= 40)
      oportunidades.push(`${a.semResposta} leads ficaram sem resposta. Cada um é um cliente que pode ter comprado no concorrente.`)
    if (a.perdidos >= 200)
      oportunidades.push(`${a.perdidos} leads marcados como perdidos — vale olhar os motivos e reativar quem dá para recuperar.`)
  }

  if (!fortes.length) fortes.push('Base sólida — vamos puxar os números um a um.')
  if (!oportunidades.length) oportunidades.push('Mantendo o padrão, o caminho é escalar o volume de leads.')
  return { fortes, oportunidades }
}

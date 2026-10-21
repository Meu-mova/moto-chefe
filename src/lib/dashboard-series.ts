export type PontoFaturamento = {
  dia: string
  atual: number
  anterior: number
  atualAcumulado: number
  anteriorAcumulado: number
}

const DIA_MS = 86_400_000
const isoDia = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * Séries do gráfico de faturamento. O período anterior tem a mesma duração e termina um dia
 * antes do atual (periodoAnterior do dashboard), então o dia N de um casa com o dia N do outro.
 * Datas em UTC só como aritmética de calendário: os dias já chegam no fuso de Brasília.
 */
export function montarSeriesFaturamento(
  periodo: { inicio: string; fim: string },
  atual: { dia: string; valor: number }[],
  anterior: { dia: string; valor: number }[],
): PontoFaturamento[] {
  const ini = Date.parse(`${periodo.inicio}T00:00:00Z`)
  const n = Math.round((Date.parse(`${periodo.fim}T00:00:00Z`) - ini) / DIA_MS) + 1
  const iniAnt = ini - n * DIA_MS
  const porDia = (rows: { dia: string; valor: number }[]) => new Map(rows.map(r => [r.dia, r.valor]))
  const mAtual = porDia(atual)
  const mAnt = porDia(anterior)

  let somaAtual = 0
  let somaAnt = 0
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const dia = isoDia(ini + i * DIA_MS)
    const vAtual = mAtual.get(dia) ?? 0
    const vAnt = mAnt.get(isoDia(iniAnt + i * DIA_MS)) ?? 0
    somaAtual += vAtual
    somaAnt += vAnt
    return { dia, atual: vAtual, anterior: vAnt, atualAcumulado: somaAtual, anteriorAcumulado: somaAnt }
  })
}

// Meta mensal de faturamento por loja e a projeção de fechamento.
//
// A projeção conta só os dias em que a loja abre (segunda a sábado). Usar dias
// corridos distorce nas duas pontas: no começo do mês um domingo derruba a média,
// e no fim ele infla o que "ainda dá pra vender".
//
// A aritmética é agnóstica de unidade — era usada com quantidade de motos até a
// migração 0066 e hoje roda em reais, sem mudança.

/** Dia da semana em UTC: 0 = domingo. Datas são construídas em UTC pra não escorregar de fuso. */
function ehDiaDeVenda(ano: number, mes: number, dia: number): boolean {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() !== 0
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Dias de venda (seg–sáb) do mês inteiro. */
export function diasDeVendaNoMes(ano: number, mes: number): number {
  let n = 0
  for (let d = 1; d <= diasNoMes(ano, mes); d++) if (ehDiaDeVenda(ano, mes, d)) n++
  return n
}

/** Dias de venda já decorridos, contando o dia informado. */
export function diasDeVendaAte(ano: number, mes: number, dia: number): number {
  let n = 0
  for (let d = 1; d <= Math.min(dia, diasNoMes(ano, mes)); d++) if (ehDiaDeVenda(ano, mes, d)) n++
  return n
}

export type ProjecaoMeta = {
  meta: number
  vendidas: number
  /** Quanto falta para a meta; 0 quando já bateu. */
  faltam: number
  diasDeVendaDecorridos: number
  diasDeVendaNoMes: number
  diasDeVendaRestantes: number
  /** Média por dia de venda até agora. */
  ritmoDiario: number
  /** Onde o mês fecha mantendo o ritmo atual. */
  projecao: number
  /** Percentual da meta já vendido. */
  percentualAtingido: number
  /** Quantas por dia de venda restante para bater a meta; null se já bateu. */
  necessarioPorDia: number | null
  situacao: 'batida' | 'acima' | 'no_ritmo' | 'abaixo'
}

/**
 * `dia` é o dia do mês de hoje. Fora do mês corrente (mês fechado), passe o
 * último dia — aí a projeção vira o próprio realizado.
 */
export function calcularProjecao(params: {
  meta: number
  vendidas: number
  ano: number
  mes: number
  dia: number
}): ProjecaoMeta {
  const { meta, vendidas, ano, mes, dia } = params

  const totalDias = diasDeVendaNoMes(ano, mes)
  const decorridos = diasDeVendaAte(ano, mes, dia)
  const restantes = Math.max(0, totalDias - decorridos)

  const ritmoDiario = decorridos > 0 ? vendidas / decorridos : 0
  const projecao = decorridos > 0 ? Math.round(ritmoDiario * totalDias) : 0

  const faltam = Math.max(0, meta - vendidas)
  const percentualAtingido = meta > 0 ? (vendidas / meta) * 100 : 0

  // Se não há mais dia de venda, o que falta não cabe mais — daí null, não infinito.
  const necessarioPorDia = faltam === 0 ? null : restantes > 0 ? faltam / restantes : null

  const situacao: ProjecaoMeta['situacao'] =
    vendidas >= meta ? 'batida' :
    projecao >= meta * 1.05 ? 'acima' :
    projecao >= meta * 0.95 ? 'no_ritmo' :
    'abaixo'

  return {
    meta,
    vendidas,
    faltam,
    diasDeVendaDecorridos: decorridos,
    diasDeVendaNoMes: totalDias,
    diasDeVendaRestantes: restantes,
    ritmoDiario,
    projecao,
    percentualAtingido,
    necessarioPorDia,
    situacao,
  }
}

/** Data de hoje em Brasília, independente do fuso do servidor (a Vercel roda em UTC). */
export function hojeEmBrasilia(agora: Date = new Date()): { ano: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora)
  const [ano, mes, dia] = partes.split('-').map(Number)
  return { ano, mes, dia }
}

// ── consolidação do mês: total do grupo + quebra por loja ───────────────────

export type LinhaMetaLoja = {
  lojaId: string
  loja: string
  /** Meta do mês, em R$. */
  meta: number
  /** Vendido no mês, em R$ (valor cheio das vendas). */
  realizado: number
}

export type LojaNaMeta = LinhaMetaLoja & {
  percentual: number
  batida: boolean
}

export type MetaDoMes = {
  total: ProjecaoMeta
  lojas: LojaNaMeta[]
}

/**
 * Junta as metas do mês com o que cada loja vendeu. Devolve null quando nenhuma
 * loja tem meta cadastrada — aí o card do dashboard nem aparece.
 *
 * Loja sem meta fica de fora dos DOIS lados da conta, não só da lista. O Galpão
 * Matriz é depósito e não tem meta; somar o que ele eventualmente faturou contra
 * meta zero daria ao grupo um percentual que nenhuma loja precisou entregar.
 */
export function montarMetaDoMes(params: {
  linhas: LinhaMetaLoja[]
  ano: number
  mes: number
  dia: number
}): MetaDoMes | null {
  const { linhas, ano, mes, dia } = params
  const comMeta = linhas.filter(l => l.meta > 0)
  if (comMeta.length === 0) return null

  const lojas = comMeta
    .map(l => ({
      ...l,
      percentual: (l.realizado / l.meta) * 100,
      batida: l.realizado >= l.meta,
    }))
    // Maior percentual primeiro: a leitura da reunião começa por quem entregou.
    .sort((a, b) => b.percentual - a.percentual)

  const total = calcularProjecao({
    meta: comMeta.reduce((a, l) => a + l.meta, 0),
    vendidas: comMeta.reduce((a, l) => a + l.realizado, 0),
    ano, mes, dia,
  })

  return { total, lojas }
}

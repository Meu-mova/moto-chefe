// Helpers puros da Coletiva — a apresentação da reunião com TODOS os vendedores.
// Só produção e crescimento: nada de comissão, custo, margem, lucro ou DRE.
// Sem banco, coberto por teste.

export type PodioVendedor = {
  usuarioId: string
  nome: string
  loja: string
  qtd: number
  total: number
  qtdAnterior: number
  totalAnterior: number
}

export type ItemColetiva = { nome: string; qtd: number; total: number }
/** faturamento = líquido (exibido); faturamentoBruto = base da meta (igual /admin/metas). */
export type LojaMeta = { loja: string; faturamento: number; faturamentoBruto: number; meta: number }
// Nome do ícone do lucide-react; a tela é que desenha.
export type IconeOportunidade = 'Smartphone' | 'MessageCircle' | 'Wrench' | 'Target'
export type Oportunidade = { icone: IconeOportunidade; titulo: string; texto: string }

/** Crescimento de faturamento sobre o mês anterior; null sem base (mês anterior zero). */
export function crescimento(atual: number, anterior: number): number | null {
  if (!anterior) return null
  return ((atual - anterior) / anterior) * 100
}

/**
 * Quem deu o maior salto de faturamento sobre o mês anterior — só quem já vendia
 * (base > 0), ordenado pelo % de crescimento. Estreantes saem por `estreantes()`.
 */
export function maioresCrescimentos(vendedores: PodioVendedor[], n = 5): (PodioVendedor & { pct: number })[] {
  return vendedores
    .filter(v => v.totalAnterior > 0 && v.total > v.totalAnterior)
    .map(v => ({ ...v, pct: ((v.total - v.totalAnterior) / v.totalAnterior) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, n)
}

/** Vendedores que não tinham venda no mês anterior e venderam agora — as estreias. */
export function estreantes(vendedores: PodioVendedor[]): PodioVendedor[] {
  return vendedores
    .filter(v => v.qtdAnterior === 0 && v.qtd > 0)
    .sort((a, b) => b.qtd - a.qtd)
}

export type OportunidadeInput = {
  semOrigemQtd: number
  totalVendas: number
  canalTopNome: string | null
  canalTopQtd: number
  osQtd: number
  osQtdAnterior: number
  recordeMotos: number
  mesLabel: string
}

/**
 * Pontos de virada da reunião — data-driven, mas com copy motivacional fixa.
 * Tudo aqui é seguro de projetar: origem, canal, volume de OS e a meta de bater
 * o próprio recorde. Nenhum valor de margem/custo.
 */
export function gerarOportunidades(i: OportunidadeInput): Oportunidade[] {
  const ops: Oportunidade[] = []

  if (i.semOrigemQtd > 0 && i.totalVendas > 0) {
    const p = Math.round((i.semOrigemQtd / i.totalVendas) * 100)
    ops.push({
      icone: 'Smartphone',
      titulo: 'Registrar a origem de toda venda.',
      texto: `${p}% das vendas (${i.semOrigemQtd}) ficaram sem origem. Sem isso a gente não sabe onde investir pra trazer mais cliente. É 1 clique por venda.`,
    })
  }

  if (i.canalTopNome && i.canalTopQtd > 0) {
    ops.push({
      icone: 'MessageCircle',
      titulo: `${i.canalTopNome} é o maior canal (${i.canalTopQtd} vendas).`,
      texto: 'Quem responde rápido, vende mais. Atendimento ágil é a diferença entre o cliente comprar com a gente ou com o concorrente.',
    })
  }

  if (i.osQtd > 0) {
    const salto = i.osQtdAnterior > 0 && i.osQtd >= i.osQtdAnterior * 1.5
      ? ` (bem acima do mês anterior, ${i.osQtdAnterior})`
      : ''
    ops.push({
      icone: 'Wrench',
      titulo: 'Oficina e pós-venda puxando junto.',
      texto: `${i.osQtd} ordens de serviço no mês${salto}. Cada revisão é um cliente que volta, e volta pra comprar de novo.`,
    })
  }

  ops.push({
    icone: 'Target',
    titulo: `Próxima meta: superar ${i.mesLabel}.`,
    texto: `${i.recordeMotos} motos foi o número deste mês. O próximo é a chance de bater de novo, juntos.`,
  })

  return ops
}

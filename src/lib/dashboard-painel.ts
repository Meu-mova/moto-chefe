import { percentualDesconto, type SomaDescontos } from '@/lib/desconto'
import { calcularPremiacao } from '@/lib/premiacao'

// Que números o topo do dashboard mostra para cada papel (#281). Puro: as mesmas
// regras dos cards antigos, para o novo visual não mudar o que cada um vê.

export type KPIs = {
  totalVendas: number
  faturamento: number
  estoque: number
  valorEstoque: number
  transferenciasPendentes: number
  garantiasAtivas: number
  osAbertas: number
}

export type EntradaPainel = {
  kpis: KPIs
  kpisAnt: KPIs
  papel: string
  isVendedor: boolean
  motoMaisVendida: { modelo: string; total: number } | null
  conciliacaoPendentes: number
  faturamentoOS: { servicos: number; pecas: number }
  faixasOTE: { valorMinimoVendas: string; premiacao: string }[]
  descontos?: SomaDescontos
}

export type Variacao = { sentido: 'alta' | 'baixa' | 'igual'; texto: string }
export type Manchete = { rotulo: string; valor: string; variacao: Variacao | null; anterior: string; serie: 'valor' | 'quantidade' | null }
export type Indicador = { rotulo: string; valor: string; alerta: boolean; href?: string; dica?: string }

const ADMINS = ['admin_geral', 'admin_socio']
// Mesma taxa fixa do card antigo; o simulador abaixo usa a do cadastro do vendedor.
const COMISSAO_CARD = 0.005

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

export function variacao(atual: number, anterior: number): Variacao | null {
  if (atual === 0 && anterior === 0) return null
  // Sem base de comparação, "+100%" mentiria: o período anterior foi zero.
  if (anterior === 0) return { sentido: 'alta', texto: 'novo' }
  const pct = Math.round((atual - anterior) / anterior * 100)
  if (pct === 0) return { sentido: 'igual', texto: '0%' }
  return { sentido: pct > 0 ? 'alta' : 'baixa', texto: `${pct > 0 ? '+' : ''}${pct}%` }
}

function manchete(rotulo: string, atual: number, anterior: number, fmt: (v: number) => string, serie: Manchete['serie']): Manchete {
  return { rotulo, valor: fmt(atual), variacao: variacao(atual, anterior), anterior: fmt(anterior), serie }
}

function indicadorDesconto(d: SomaDescontos, faturamento: number): Indicador {
  const pct = percentualDesconto(d.margem, faturamento)
  const partes = [`${d.qtd} ${d.qtd === 1 ? 'venda' : 'vendas'}`]
  if (pct > 0) partes.push(`${pct}% do faturamento`)
  if (d.estimados > 0) partes.push(`${d.estimados} estimada${d.estimados === 1 ? '' : 's'}`)
  return { rotulo: 'Descontos', valor: brl(d.margem), alerta: false, dica: partes.join(' · ') }
}

const qtd = (v: number) => String(v)
const ticket = (k: KPIs) => k.totalVendas ? k.faturamento / k.totalVendas : 0

export function montarPainel(e: EntradaPainel): { manchete: Manchete[]; indicadores: Indicador[] } {
  const { kpis, kpisAnt } = e
  if (e.isVendedor) {
    const premiacao = calcularPremiacao(kpis.faturamento, e.faixasOTE)
    const indicadores: Indicador[] = [
      { rotulo: 'Mais vendida', valor: e.motoMaisVendida ? `${e.motoMaisVendida.modelo} (${e.motoMaisVendida.total})` : '—', alerta: false },
      { rotulo: 'Premiação OTE', valor: brl(premiacao), alerta: false, dica: `${brl(calcularPremiacao(kpisAnt.faturamento, e.faixasOTE))} no período anterior` },
    ]
    if (e.descontos) indicadores.push(indicadorDesconto(e.descontos, kpis.faturamento))
    return {
      manchete: [
        manchete('Total de vendas', kpis.faturamento, kpisAnt.faturamento, brl, 'valor'),
        manchete('Motos vendidas', kpis.totalVendas, kpisAnt.totalVendas, qtd, 'quantidade'),
        manchete('Comissão', kpis.faturamento * COMISSAO_CARD, kpisAnt.faturamento * COMISSAO_CARD, brl, null),
      ],
      indicadores,
    }
  }

  const admin = ADMINS.includes(e.papel)
  const indicadores: Indicador[] = [{ rotulo: 'Showroom', valor: `${kpis.estoque} ${kpis.estoque === 1 ? 'moto' : 'motos'}`, alerta: false }]
  if (admin) indicadores.push({ rotulo: 'Valor em showroom', valor: brl(kpis.valorEstoque), alerta: false })
  indicadores.push(
    { rotulo: 'Transferências pendentes', valor: qtd(kpis.transferenciasPendentes), alerta: false },
    { rotulo: 'Garantias ativas', valor: qtd(kpis.garantiasAtivas), alerta: false },
    { rotulo: 'OS abertas', valor: qtd(kpis.osAbertas), alerta: false },
    { rotulo: 'OS · serviços', valor: brl(e.faturamentoOS.servicos), alerta: false },
    { rotulo: 'OS · peças', valor: brl(e.faturamentoOS.pecas), alerta: false },
  )
  if (admin) {
    const n = e.conciliacaoPendentes
    indicadores.push({ rotulo: 'Conciliação cartão', valor: n > 0 ? `${n} ${n === 1 ? 'pendente' : 'pendentes'}` : 'Em dia', alerta: n > 0, href: '/conciliacao' })
  }
  if (e.descontos) indicadores.push(indicadorDesconto(e.descontos, kpis.faturamento))
  return {
    manchete: [
      manchete('Faturamento', kpis.faturamento, kpisAnt.faturamento, brl, 'valor'),
      manchete('Motos vendidas', kpis.totalVendas, kpisAnt.totalVendas, qtd, 'quantidade'),
      manchete('Ticket médio', ticket(kpis), ticket(kpisAnt), brl, null),
    ],
    indicadores,
  }
}

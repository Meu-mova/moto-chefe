import { percentualDesconto, type SomaDescontos } from '@/lib/desconto'
import { calcularPremiacao } from '@/lib/premiacao'

// Que números o topo do dashboard mostra para cada papel (#281). Regras copiadas dos
// cards antigos (kpi-cards.tsx); módulo puro para dar para testar sem banco.

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

// Os mesmos dois papéis do dashboard (page.tsx). isAdmin() de @/lib/auth é só admin_geral
// e puxa o banco, o que tiraria este módulo do teste puro.
const ADMINS = ['admin_geral', 'admin_socio']
// Taxa fixa herdada do card antigo; SimuladorComissaoOTE usa a do cadastro do vendedor.
const COMISSAO_PADRAO = 0.005

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

// toLocaleString põe espaço sem quebra (U+00A0) depois do R$; troca por espaço comum para o texto e os testes compararem igual.
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
  const partes = [plural(d.qtd, 'venda', 'vendas')]
  if (pct > 0) partes.push(`${pct}% do faturamento`)
  if (d.estimados > 0) partes.push(plural(d.estimados, 'estimada', 'estimadas'))
  return { rotulo: 'Descontos', valor: brl(d.margem), alerta: false, dica: partes.join(' · ') }
}

const qtd = (v: number) => String(v)
const ticket = (k: KPIs) => k.totalVendas ? k.faturamento / k.totalVendas : 0

export function montarPainel(e: EntradaPainel): { manchete: Manchete[]; indicadores: Indicador[] } {
  const { kpis, kpisAnt } = e
  if (e.isVendedor) {
    const premiacao = calcularPremiacao(kpis.faturamento, e.faixasOTE)
    const premiacaoAnt = calcularPremiacao(kpisAnt.faturamento, e.faixasOTE)
    const varPremiacao = variacao(premiacao, premiacaoAnt)
    const indicadores: Indicador[] = [
      { rotulo: 'Mais vendida', valor: e.motoMaisVendida ? `${e.motoMaisVendida.modelo} (${e.motoMaisVendida.total})` : '—', alerta: false },
      { rotulo: 'Premiação OTE', valor: brl(premiacao), alerta: false, dica: `${varPremiacao ? `${varPremiacao.texto} · ` : ''}${brl(premiacaoAnt)} no período anterior` },
    ]
    if (e.descontos) indicadores.push(indicadorDesconto(e.descontos, kpis.faturamento))
    return {
      manchete: [
        manchete('Total de vendas', kpis.faturamento, kpisAnt.faturamento, brl, 'valor'),
        manchete('Motos vendidas', kpis.totalVendas, kpisAnt.totalVendas, qtd, 'quantidade'),
        manchete('Comissão', kpis.faturamento * COMISSAO_PADRAO, kpisAnt.faturamento * COMISSAO_PADRAO, brl, null),
      ],
      indicadores,
    }
  }

  const admin = ADMINS.includes(e.papel)
  const indicadores: Indicador[] = [{ rotulo: 'Showroom', valor: plural(kpis.estoque, 'moto', 'motos'), alerta: false }]
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
    indicadores.push({ rotulo: 'Conciliação cartão', valor: n > 0 ? plural(n, 'pendente', 'pendentes') : 'Em dia', alerta: n > 0, href: '/conciliacao' })
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

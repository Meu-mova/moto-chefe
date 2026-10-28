import { execRows } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { metasDoMes } from './metas'
import { valorLiquidoSql } from './valor-liquido'
import { nomeDoModeloSql } from '@/lib/modelos-da-conta'
import {
  gerarOportunidades, type PodioVendedor, type ItemColetiva, type LojaMeta, type Oportunidade,
} from '@/lib/coletiva'

// Dados da Coletiva — a reunião com TODOS os vendedores. DE PROPÓSITO só busca
// produção e crescimento: não toca em DRE, comissão, custo ou margem, pra que
// nada sensível chegue nem no payload da página projetada. Escopo do grupo ativo,
// bordas de mês em UTC (iguais ao fechamento/metas), vendedor inativo fica de fora.
//
// Faturamento em LÍQUIDO (valorLiquidoSql): a venda entra pelo valor menos a taxa
// de cartão da parte já conciliada — a mesma base do DRE. Mês recém-fechado com
// conciliação pendente aparece otimista e encolhe conforme as transações casam.

export type DadosColetiva = {
  ano: number
  mes: number
  consolidado: { qtd: number; faturamento: number; faturamentoBruto: number; ticket: number; clientes: number }
  anterior: { qtd: number; faturamento: number }
  metaTotal: number
  vendedores: PodioVendedor[]
  modelos: ItemColetiva[]
  lojas: LojaMeta[]
  oportunidades: Oportunidade[]
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const n = (v: unknown) => Number(v ?? 0)
const bordas = (ano: number, mes: number) => ({
  ini: new Date(Date.UTC(ano, mes - 1, 1)).toISOString(),
  fim: new Date(Date.UTC(ano, mes, 1)).toISOString(),
})

export async function dadosColetiva(opts: {
  grupoId: string
  lojaIds: string[]
  ano: number
  mes: number
}): Promise<DadosColetiva> {
  const { grupoId: g, lojaIds, ano, mes } = opts
  const { ini, fim } = bordas(ano, mes)
  const antAno = mes === 1 ? ano - 1 : ano
  const antMes = mes === 1 ? 12 : mes - 1
  const bAnt = bordas(antAno, antMes)

  const [consRow, vendRows, modRows, lojaRows, origRows, osRow, metas] = await Promise.all([
    // Consolidado do grupo: mês atual e anterior lado a lado
    execRows(sql`
      select
        count(*) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim})::int as qtd,
        coalesce(sum(${valorLiquidoSql()}) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim}),0)::text as fat,
        coalesce(sum(v.valor::numeric) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim}),0)::text as fat_bruto,
        count(distinct nullif(v.cliente_cpf,'')) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim})::int as clientes,
        count(*) filter (where v.data_venda >= ${bAnt.ini} and v.data_venda < ${bAnt.fim})::int as qtd_ant,
        coalesce(sum(${valorLiquidoSql()}) filter (where v.data_venda >= ${bAnt.ini} and v.data_venda < ${bAnt.fim}),0)::text as fat_ant
      from vendas v join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${bAnt.ini} and v.data_venda < ${fim}`),
    // Vendedores ativos: unidades e faturamento do mês atual e do anterior, por loja
    execRows(sql`
      select v.vendedor_id, u.nome, l.nome as loja,
        count(*) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim})::int as qtd,
        coalesce(sum(${valorLiquidoSql()}) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim}),0)::text as total,
        count(*) filter (where v.data_venda >= ${bAnt.ini} and v.data_venda < ${bAnt.fim})::int as qtd_ant,
        coalesce(sum(${valorLiquidoSql()}) filter (where v.data_venda >= ${bAnt.ini} and v.data_venda < ${bAnt.fim}),0)::text as total_ant
      from vendas v join usuarios u on u.id=v.vendedor_id join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and u.ativo and v.data_venda >= ${bAnt.ini} and v.data_venda < ${fim}
      group by v.vendedor_id, u.nome, l.nome`),
    // Modelos campeões do mês
    execRows(sql`
      select ${nomeDoModeloSql('mo', 'v.loja_id')} as nome, count(*)::int as qtd, coalesce(sum(${valorLiquidoSql()}),0)::text as total
      from vendas v join motos m on m.id=v.moto_id join modelos mo on mo.id=m.modelo_id join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${ini} and v.data_venda < ${fim}
      group by ${nomeDoModeloSql('mo', 'v.loja_id')}`),
    // Faturamento por loja (pra parear com a meta)
    execRows(sql`
      select l.id as loja_id, l.nome as loja,
             coalesce(sum(${valorLiquidoSql()}),0)::text as fat,
             coalesce(sum(v.valor::numeric),0)::text as fat_bruto
      from lojas l left join vendas v on v.loja_id=l.id and v.data_venda >= ${ini} and v.data_venda < ${fim}
      where l.grupo_id = ${g} and l.ativa = true
      group by l.id, l.nome`),
    // Origem das vendas — pra "sem origem" e o canal campeão
    execRows(sql`
      select coalesce(o.nome,'(sem origem)') as nome, count(*)::int as qtd
      from vendas v left join origens_venda o on o.id=v.origem_id join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${ini} and v.data_venda < ${fim}
      group by o.nome`),
    // OS concluídas: mês atual e anterior (pra falar de pós-venda)
    execRows(sql`
      select
        count(*) filter (where o.data_conclusao >= ${ini} and o.data_conclusao < ${fim})::int as qtd,
        count(*) filter (where o.data_conclusao >= ${bAnt.ini} and o.data_conclusao < ${bAnt.fim})::int as qtd_ant
      from ordens_servico o join lojas l on l.id=o.loja_id
      where l.grupo_id = ${g} and o.status='concluida' and o.data_conclusao >= ${bAnt.ini} and o.data_conclusao < ${fim}`),
    metasDoMes(lojaIds, ano, mes),
  ])

  const c = (consRow as any[])[0] ?? {}
  const consolidado = {
    qtd: n(c.qtd), faturamento: n(c.fat), faturamentoBruto: n(c.fat_bruto),
    ticket: n(c.qtd) ? n(c.fat) / n(c.qtd) : 0, clientes: n(c.clientes),
  }
  const anterior = { qtd: n(c.qtd_ant), faturamento: n(c.fat_ant) }

  // Um vendedor pode aparecer em duas lojas (Pablo): soma tudo, loja principal = onde mais vendeu.
  type Acc = PodioVendedor & { lojas: Map<string, number> }
  const porVend = new Map<string, Acc>()
  for (const r of vendRows as any[]) {
    const id = r.vendedor_id as string
    const a = porVend.get(id) ?? {
      usuarioId: id, nome: r.nome, loja: '—', qtd: 0, total: 0, qtdAnterior: 0, totalAnterior: 0, lojas: new Map(),
    }
    a.qtd += n(r.qtd); a.total += n(r.total); a.qtdAnterior += n(r.qtd_ant); a.totalAnterior += n(r.total_ant)
    a.lojas.set(r.loja, (a.lojas.get(r.loja) ?? 0) + n(r.qtd))
    porVend.set(id, a)
  }
  const vendedores: PodioVendedor[] = [...porVend.values()]
    .filter(a => a.qtd > 0)
    .map(({ lojas, ...v }) => ({ ...v, loja: [...lojas.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '—' }))
    // Pódio por unidades; empate desempata pelo faturamento.
    .sort((a, b) => b.qtd - a.qtd || b.total - a.total)

  const modelos: ItemColetiva[] = (modRows as any[])
    .map(r => ({ nome: r.nome as string, qtd: n(r.qtd), total: n(r.total) }))
    .sort((a, b) => b.total - a.total)

  const lojas: LojaMeta[] = (lojaRows as any[])
    .map(r => ({ loja: r.loja as string, faturamento: n(r.fat), faturamentoBruto: n(r.fat_bruto), meta: metas.get(r.loja_id) ?? 0 }))
    .filter(l => l.faturamento > 0 || l.meta > 0)
    .sort((a, b) => b.faturamento - a.faturamento)

  // Origem: separa o "sem origem" e acha o canal campeão entre os identificados.
  const semOrigem = (origRows as any[]).find(r => /^\(sem/i.test(r.nome))
  const canalTop = (origRows as any[])
    .filter(r => !/^\(sem/i.test(r.nome))
    .sort((a, b) => n(b.qtd) - n(a.qtd))[0]
  const os = (osRow as any[])[0] ?? {}

  const oportunidades = gerarOportunidades({
    semOrigemQtd: n(semOrigem?.qtd),
    totalVendas: consolidado.qtd,
    canalTopNome: canalTop?.nome ?? null,
    canalTopQtd: n(canalTop?.qtd),
    osQtd: n(os.qtd),
    osQtdAnterior: n(os.qtd_ant),
    recordeMotos: consolidado.qtd,
    mesLabel: MESES[mes - 1] ?? '',
  })

  return {
    ano, mes, consolidado, anterior,
    metaTotal: [...metas.values()].reduce((a, v) => a + v, 0),
    vendedores, modelos, lojas, oportunidades,
  }
}

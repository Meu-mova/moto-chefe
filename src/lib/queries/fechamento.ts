import { execRows } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { metasDoMes } from './metas'
import { dreDoMes } from './dre'
import { montarDre, somarEntradas, ENTRADA_VAZIA, type LinhaDre } from '@/lib/dre'

// Fechamento mensal de um grupo. Os números batem com o resto do sistema porque:
// as bordas do mês são as MESMAS do DRE/metas (UTC: [1º do mês, 1º do seguinte)),
// e o resultado financeiro sai do próprio DRE (queries/dre.ts).
//
// As agregações filtram por `l.grupo_id` (escalar) em vez de um array de lojaIds
// — evita o bug de array dentro de sql`` (ver [[feedback_drizzle_array_sql]]) e é
// equivalente, já que lojaIds = as lojas do grupo.

export type Item = { nome: string; qtd: number; total: number }
export type LojaFechamento = {
  lojaId: string
  loja: string
  qtd: number
  faturamento: number
  faturamentoAnterior: number
  ticket: number
  clientes: number
  meta: number
  os: { qtd: number; total: number }
  vendedores: Item[]
  modelos: Item[]
  origem: Item[]
  pagamento: Item[]
}
export type DadosFechamento = {
  ano: number
  mes: number
  consolidado: { qtd: number; faturamento: number; ticket: number; clientes: number }
  anterior: { qtd: number; faturamento: number }
  metaTotal: number
  porLoja: LojaFechamento[]
  vendedores: Item[]
  modelos: Item[]
  origem: Item[]
  pagamento: Item[]
  diario: { dia: number; qtd: number; total: number }[]
  servicos: { qtd: number; total: number; servicos: number; pecas: number }
  pecasBalcao: { qtd: number; total: number }
  garantias: number
  estoque: number
  dre: LinhaDre[]
}

const n = (v: unknown) => Number(v ?? 0)
const bordas = (ano: number, mes: number) => ({
  ini: new Date(Date.UTC(ano, mes - 1, 1)).toISOString(),
  fim: new Date(Date.UTC(ano, mes, 1)).toISOString(),
})

export async function dadosFechamento(opts: {
  grupoId: string
  lojaIds: string[]
  ano: number
  mes: number
}): Promise<DadosFechamento> {
  const { grupoId, lojaIds, ano, mes } = opts
  const g = grupoId
  const { ini, fim } = bordas(ano, mes)
  const anteriorMes = mes === 1 ? 12 : mes - 1
  const anteriorAno = mes === 1 ? ano - 1 : ano
  const bAnt = bordas(anteriorAno, anteriorMes)

  const [
    lojasRows, antRows, vendRows, modRows, origRows, pagRows, diaRows,
    osRows, pecasRow, garRow, estRow, metas, dre,
  ] = await Promise.all([
    // Vendas do mês por loja
    execRows(sql`
      select l.id as loja_id, l.nome as loja,
             count(v.id)::int as qtd,
             coalesce(sum(v.valor::numeric),0)::text as faturamento,
             count(distinct nullif(v.cliente_cpf,''))::int as clientes
      from lojas l
      left join vendas v on v.loja_id=l.id and v.data_venda >= ${ini} and v.data_venda < ${fim}
      where l.grupo_id = ${g} and l.ativa = true
      group by l.id, l.nome`),
    // Vendas do mês anterior por loja (só p/ comparativo)
    execRows(sql`
      select v.loja_id, count(*)::int as qtd, coalesce(sum(v.valor::numeric),0)::text as faturamento
      from vendas v join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${bAnt.ini} and v.data_venda < ${bAnt.fim}
      group by v.loja_id`),
    execRows(sql`
      select v.loja_id, u.nome as nome, count(*)::int as qtd, coalesce(sum(v.valor::numeric),0)::text as total
      from vendas v join usuarios u on u.id=v.vendedor_id join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and u.ativo and v.data_venda >= ${ini} and v.data_venda < ${fim}
      group by v.loja_id, u.nome`),
    execRows(sql`
      select v.loja_id, mo.modelo as nome, count(*)::int as qtd, coalesce(sum(v.valor::numeric),0)::text as total
      from vendas v join motos m on m.id=v.moto_id join modelos mo on mo.id=m.modelo_id join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${ini} and v.data_venda < ${fim}
      group by v.loja_id, mo.modelo`),
    execRows(sql`
      select v.loja_id, coalesce(o.nome,'(sem origem)') as nome, count(*)::int as qtd, coalesce(sum(v.valor::numeric),0)::text as total
      from vendas v left join origens_venda o on o.id=v.origem_id join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${ini} and v.data_venda < ${fim}
      group by v.loja_id, o.nome`),
    execRows(sql`
      select v.loja_id, e->>'tipo' as nome, count(*)::int as qtd, coalesce(sum((e->>'valor')::numeric),0)::text as total
      from vendas v cross join lateral jsonb_array_elements(v.pagamentos) e join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${ini} and v.data_venda < ${fim}
      group by v.loja_id, e->>'tipo'`),
    // Ritmo diário (dia do calendário de Brasília) — nível grupo
    execRows(sql`
      select to_char(v.data_venda at time zone 'America/Sao_Paulo','DD')::int as dia,
             count(*)::int as qtd, coalesce(sum(v.valor::numeric),0)::text as total
      from vendas v join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${ini} and v.data_venda < ${fim}
      group by dia order by dia`),
    // OS concluídas por loja
    execRows(sql`
      select o.loja_id, count(*)::int as qtd,
             coalesce(sum(o.valor_total::numeric),0)::text as total,
             coalesce(sum(o.valor_servicos::numeric),0)::text as servicos,
             coalesce(sum(o.valor_pecas::numeric),0)::text as pecas
      from ordens_servico o join lojas l on l.id=o.loja_id
      where l.grupo_id = ${g} and o.status='concluida' and o.data_conclusao >= ${ini} and o.data_conclusao < ${fim}
      group by o.loja_id`),
    execRows(sql`
      select count(*)::int as qtd, coalesce(sum(vp.valor_total::numeric),0)::text as total
      from vendas_pecas vp join lojas l on l.id=vp.loja_id
      where l.grupo_id = ${g} and vp.data_venda >= ${ini} and vp.data_venda < ${fim}`),
    execRows(sql`
      select count(*)::int as qtd
      from garantias ga join lojas l on l.id=ga.loja_id
      where l.grupo_id = ${g} and ga.data_inicio >= ${ini}::date and ga.data_inicio < ${fim}::date`),
    execRows(sql`
      select count(*)::int as qtd
      from motos m join lojas l on l.id=m.loja_id
      where l.grupo_id = ${g} and m.disponibilidade is distinct from 'vendida'`),
    metasDoMes(lojaIds, ano, mes),
    dreDoMes({ grupoId, lojaIds, ano, mes }),
  ])

  // Índices por loja
  const antPorLoja = new Map((antRows as any[]).map(r => [r.loja_id, { qtd: n(r.qtd), faturamento: n(r.faturamento) }]))
  const byLoja = <T extends { loja_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>()
    for (const r of rows) { const a = m.get(r.loja_id) ?? []; a.push(r); m.set(r.loja_id, a) }
    return m
  }
  const toItems = (rows: any[]) =>
    rows.map(r => ({ nome: r.nome as string, qtd: n(r.qtd), total: n(r.total) }))
        .sort((a, b) => b.total - a.total)
  const vendByLoja = byLoja(vendRows as any[])
  const modByLoja = byLoja(modRows as any[])
  const origByLoja = byLoja(origRows as any[])
  const pagByLoja = byLoja(pagRows as any[])
  const osByLoja = new Map((osRows as any[]).map(r => [r.loja_id, r]))

  const porLoja: LojaFechamento[] = (lojasRows as any[])
    .filter(l => n(l.qtd) > 0)
    .map(l => {
      const os = osByLoja.get(l.loja_id)
      const ant = antPorLoja.get(l.loja_id)
      const fat = n(l.faturamento)
      const qtd = n(l.qtd)
      return {
        lojaId: l.loja_id, loja: l.loja, qtd, faturamento: fat,
        faturamentoAnterior: ant?.faturamento ?? 0,
        ticket: qtd ? fat / qtd : 0,
        clientes: n(l.clientes),
        meta: metas.get(l.loja_id) ?? 0,
        os: { qtd: os ? n(os.qtd) : 0, total: os ? n(os.total) : 0 },
        vendedores: toItems(vendByLoja.get(l.loja_id) ?? []),
        modelos: toItems(modByLoja.get(l.loja_id) ?? []),
        origem: toItems(origByLoja.get(l.loja_id) ?? []),
        pagamento: toItems(pagByLoja.get(l.loja_id) ?? []),
      }
    })
    .sort((a, b) => b.faturamento - a.faturamento)

  // Consolida os itens do grupo somando por nome
  const consolidaItens = (rows: any[]): Item[] => {
    const m = new Map<string, Item>()
    for (const r of rows) {
      const k = r.nome as string
      const cur = m.get(k) ?? { nome: k, qtd: 0, total: 0 }
      cur.qtd += n(r.qtd); cur.total += n(r.total)
      m.set(k, cur)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }

  const consolidado = porLoja.reduce(
    (a, l) => ({ qtd: a.qtd + l.qtd, faturamento: a.faturamento + l.faturamento, clientes: a.clientes + l.clientes }),
    { qtd: 0, faturamento: 0, clientes: 0 },
  )
  const anterior = [...antPorLoja.values()].reduce(
    (a, v) => ({ qtd: a.qtd + v.qtd, faturamento: a.faturamento + v.faturamento }), { qtd: 0, faturamento: 0 },
  )
  const somaOS = (osRows as any[]).reduce(
    (a, r) => ({ qtd: a.qtd + n(r.qtd), total: a.total + n(r.total), servicos: a.servicos + n(r.servicos), pecas: a.pecas + n(r.pecas) }),
    { qtd: 0, total: 0, servicos: 0, pecas: 0 },
  )

  const totalDre = dre.colunas.reduce((acc, c) => somarEntradas(acc, c.entrada), ENTRADA_VAZIA)

  return {
    ano, mes,
    consolidado: {
      qtd: consolidado.qtd, faturamento: consolidado.faturamento,
      ticket: consolidado.qtd ? consolidado.faturamento / consolidado.qtd : 0,
      clientes: consolidado.clientes,
    },
    anterior,
    metaTotal: [...metas.values()].reduce((a, v) => a + v, 0),
    porLoja,
    vendedores: consolidaItens(vendRows as any[]).slice(0, 12),
    modelos: consolidaItens(modRows as any[]),
    origem: consolidaItens(origRows as any[]),
    pagamento: consolidaItens(pagRows as any[]),
    diario: (diaRows as any[]).map(r => ({ dia: n(r.dia), qtd: n(r.qtd), total: n(r.total) })),
    servicos: somaOS,
    pecasBalcao: { qtd: n((pecasRow as any[])[0]?.qtd), total: n((pecasRow as any[])[0]?.total) },
    garantias: n((garRow as any[])[0]?.qtd),
    estoque: n((estRow as any[])[0]?.qtd),
    dre: montarDre(totalDre),
  }
}

import { execRows } from '@/lib/db'
import { sql, type SQL } from 'drizzle-orm'
import { somarDescontos, type LinhaDesconto } from '@/lib/desconto'

/**
 * Descontos concedidos — leitura do snapshot gravado em aprovacoes_venda.
 *
 * O desconto vive na aprovação, não na venda, e a aprovação não aponta pra venda
 * (a venda só nasce quando alguém aprova). O vínculo é pela moto. Como o
 * cancelamento APAGA a linha da venda, uma moto vendida, cancelada e revendida
 * tem mais de uma venda no histórico — daí o LATERAL escolher a venda mais
 * próxima em data da resposta da aprovação, em vez de casar todas. Isso garante
 * que cada aprovação conte uma vez só.
 *
 * O período e a loja filtram pela VENDA, não pela aprovação: assim a coluna de
 * desconto fecha com a de faturamento na mesma linha do ranking, mesmo quando a
 * venda foi lançada com data retroativa. A atribuição também é do dono atual da
 * venda — se ela foi reatribuída depois, o desconto vai junto.
 */
const DESCONTO_POR_VENDA = sql`
  SELECT a.valor_minimo_snapshot,
         a.liquido_snapshot,
         a.snapshot_estimado,
         v.id           AS venda_id,
         v.vendedor_id,
         v.loja_id,
         v.data_venda,
         v.valor
    FROM aprovacoes_venda a
    JOIN LATERAL (
           SELECT v.id, v.vendedor_id, v.loja_id, v.data_venda, v.valor
             FROM vendas v
            WHERE v.moto_id = a.moto_id
            ORDER BY abs(EXTRACT(EPOCH FROM (v.data_venda - a.data_resposta)))
            LIMIT 1
         ) v ON true
   WHERE a.tipo = 'valor_minimo'
     AND a.status = 'aprovada'
     AND a.valor_minimo_snapshot IS NOT NULL
`

export type Filtros = {
  dataInicio: string
  dataFim: string
  lojaId?: string[]
  vendedorId?: string[]
}

export type DescontoVendedor = {
  vendedorId: string
  qtd: number
  margem: number
  preco: number
  estimados: number
}

function filtrosSql(f: Filtros): SQL {
  const partes: SQL[] = [
    sql`d.data_venda >= ${f.dataInicio}::date`,
    sql`d.data_venda < (${f.dataFim}::date + 1)`,
  ]
  // Array VAZIO significa "ninguém", não "sem filtro" — é o que o dashboard passa
  // para quem não pode ver desconto de terceiros. Tratar como ausente vazaria a
  // lista inteira. Mesma razão do inArray([]) nas queries do dashboard.
  // sql.param nos arrays: sem ele o Drizzle expande em lista e o ::uuid[] estoura.
  if (f.lojaId !== undefined) {
    partes.push(f.lojaId.length ? sql`d.loja_id = ANY(${sql.param(f.lojaId)}::uuid[])` : sql`false`)
  }
  if (f.vendedorId !== undefined) {
    partes.push(f.vendedorId.length ? sql`d.vendedor_id = ANY(${sql.param(f.vendedorId)}::uuid[])` : sql`false`)
  }
  return sql.join(partes, sql` AND `)
}

const linha = (r: Record<string, unknown>): LinhaDesconto => ({
  valorMinimoSnapshot: r.valor_minimo_snapshot as string | null,
  liquidoSnapshot: r.liquido_snapshot as string | null,
  valor: String(r.valor),
  snapshotEstimado: Boolean(r.snapshot_estimado),
})

/** Um registro por vendedor com desconto no período. Quem não descontou não aparece. */
export async function descontosPorVendedor(f: Filtros): Promise<DescontoVendedor[]> {
  const rows = await execRows(sql`
    WITH d AS (${DESCONTO_POR_VENDA})
    SELECT * FROM d WHERE ${filtrosSql(f)}
  `)
  const porVendedor = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const id = String(r.vendedor_id)
    const lista = porVendedor.get(id) ?? []
    lista.push(r)
    porVendedor.set(id, lista)
  }
  return [...porVendedor.entries()].map(([vendedorId, lista]) => ({
    vendedorId,
    ...somarDescontos(lista.map(linha)),
  }))
}

/** Total do período, para o card do dashboard e o resumo de /vendas. */
export async function totalDescontos(f: Filtros) {
  const rows = await execRows(sql`
    WITH d AS (${DESCONTO_POR_VENDA})
    SELECT * FROM d WHERE ${filtrosSql(f)}
  `)
  return somarDescontos(rows.map(linha))
}

export type DescontoDaVenda = { margem: number; preco: number; estimado: boolean; motivo: string }

/**
 * Desconto de cada venda listada, para a coluna de /vendas. Chaveado por venda_id;
 * venda sem desconto não entra no mapa.
 */
export async function descontosDasVendas(vendaIds: string[]) {
  if (vendaIds.length === 0) return new Map<string, DescontoDaVenda>()
  const rows = await execRows(sql`
    WITH d AS (
      SELECT a.valor_minimo_snapshot, a.liquido_snapshot, a.snapshot_estimado, a.motivo,
             v.id AS venda_id, v.valor
        FROM aprovacoes_venda a
        JOIN LATERAL (
               SELECT v.id, v.valor, v.data_venda
                 FROM vendas v
                WHERE v.moto_id = a.moto_id
                ORDER BY abs(EXTRACT(EPOCH FROM (v.data_venda - a.data_resposta)))
                LIMIT 1
             ) v ON true
       WHERE a.tipo = 'valor_minimo'
         AND a.status = 'aprovada'
         AND a.valor_minimo_snapshot IS NOT NULL
    )
    SELECT * FROM d WHERE d.venda_id = ANY(${sql.param(vendaIds)}::uuid[])
  `)
  const mapa = new Map<string, DescontoDaVenda>()
  for (const r of rows) {
    const soma = somarDescontos([linha(r)])
    mapa.set(String(r.venda_id), {
      margem: soma.margem,
      preco: soma.preco,
      estimado: Boolean(r.snapshot_estimado),
      motivo: String(r.motivo ?? ''),
    })
  }
  return mapa
}

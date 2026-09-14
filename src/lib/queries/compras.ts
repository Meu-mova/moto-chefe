import { db } from '@/lib/db'
import { motos, vendas, modelos } from '@/lib/db/schema'
import { eq, and, gte, sql, inArray } from 'drizzle-orm'

export type ItemCompra = {
  modeloId: string
  modelo: string
  marca: string
  cor: string
  estoque: number
  vendas15d: number
  diasCobertura: number
  sugerido: number
  urgencia: 'critico' | 'atencao' | 'ok' | 'sem_saida'
}

export type GrupoCompra = {
  modeloId: string
  modelo: string
  marca: string
  items: ItemCompra[]
  totalEstoque: number
  totalVendas15d: number
  totalSugerido: number
  piorUrgencia: ItemCompra['urgencia']
}

const URGENCIA_ORDER: Record<ItemCompra['urgencia'], number> = {
  critico: 0, atencao: 1, ok: 2, sem_saida: 3,
}

export async function listarDadosCompras(lojaId: string | undefined, grupoLojaIds: string[]): Promise<GrupoCompra[]> {
  const quinzeDiasAtras = new Date()
  quinzeDiasAtras.setDate(quinzeDiasAtras.getDate() - 15)

  const lojaCond = lojaId ? eq(motos.lojaId, lojaId) : inArray(motos.lojaId, grupoLojaIds)

  const [estoqueRows, vendasRows] = await Promise.all([
    db
      .select({
        modeloId: motos.modeloId,
        modelo: modelos.modelo,
        marca: modelos.marca,
        cor: motos.cor,
        qtd: sql<number>`count(*)::int`,
      })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(and(
        // Moto cadastrada só para garantia de veículo externo nunca é estoque —
        // mesma regra do showroom (queries/motos.ts). Sem isto ela entrava na
        // contagem aqui e não lá, e os dois módulos divergiam por uma unidade.
        eq(motos.somenteGarantia, false),
        // Fora: vendida por qualquer um dos dois lados.
        //
        // Olhar os DOIS campos é de propósito, e é a diferença conhecida para o
        // showroom: ao fechar a venda a moto fica com status 'vendida' e
        // disponibilidade nula, e só vira disponibilidade='vendida' quando a NF
        // de saída é registrada (vendas/actions.ts). O showroom continua
        // mostrando essas — a NF ainda está pendente e alguém precisa ver a moto
        // lá. Para decidir COMPRA ela não é estoque: já tem dono.
        //
        // Moto em caixa (status 'caixa', ainda não montada) CONTA como estoque:
        // está comprada e no galpão, e pedir de novo seria comprar duas vezes.
        sql`(${motos.status}::text != 'vendida' AND ${motos.disponibilidade} IS DISTINCT FROM 'vendida'::disponibilidade_moto)`,
        lojaCond,
      ))
      .groupBy(motos.modeloId, modelos.modelo, modelos.marca, motos.cor),

    db
      .select({
        modeloId: motos.modeloId,
        modelo: modelos.modelo,
        marca: modelos.marca,
        cor: motos.cor,
        qtd: sql<number>`count(*)::int`,
      })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(and(
        gte(vendas.dataVenda, quinzeDiasAtras),
        lojaCond,
      ))
      .groupBy(motos.modeloId, modelos.modelo, modelos.marca, motos.cor),
  ])

  // Merge estoque + vendas por (modeloId, cor)
  const map = new Map<string, {
    modeloId: string; modelo: string; marca: string; cor: string
    estoque: number; vendas15d: number
  }>()

  for (const r of estoqueRows) {
    map.set(`${r.modeloId}:${r.cor}`, {
      modeloId: r.modeloId, modelo: r.modelo, marca: r.marca, cor: r.cor,
      estoque: r.qtd, vendas15d: 0,
    })
  }
  for (const r of vendasRows) {
    const k = `${r.modeloId}:${r.cor}`
    const ex = map.get(k)
    if (ex) {
      ex.vendas15d = r.qtd
    } else {
      map.set(k, {
        modeloId: r.modeloId, modelo: r.modelo, marca: r.marca, cor: r.cor,
        estoque: 0, vendas15d: r.qtd,
      })
    }
  }

  // Calcula métricas derivadas
  const items: ItemCompra[] = Array.from(map.values()).map(row => {
    const diasCobertura = row.vendas15d > 0
      ? (row.estoque * 15) / row.vendas15d
      : Infinity

    const sugerido = row.vendas15d > 0
      ? Math.max(0, Math.ceil(row.vendas15d * 2) - row.estoque)
      : 0

    const urgencia: ItemCompra['urgencia'] = row.vendas15d === 0
      ? 'sem_saida'
      : diasCobertura < 7  ? 'critico'
      : diasCobertura < 15 ? 'atencao'
      : 'ok'

    return { ...row, diasCobertura, sugerido, urgencia }
  })

  // Agrupa por modelo
  const grupoMap = new Map<string, GrupoCompra>()
  for (const item of items) {
    const g = grupoMap.get(item.modeloId)
    if (g) {
      g.items.push(item)
    } else {
      grupoMap.set(item.modeloId, {
        modeloId: item.modeloId, modelo: item.modelo, marca: item.marca,
        items: [item],
        totalEstoque: 0, totalVendas15d: 0, totalSugerido: 0,
        piorUrgencia: 'sem_saida',
      })
    }
  }

  // Ordena items dentro de cada grupo e calcula totais
  for (const g of grupoMap.values()) {
    g.items.sort((a, b) =>
      URGENCIA_ORDER[a.urgencia] - URGENCIA_ORDER[b.urgencia] || a.cor.localeCompare(b.cor)
    )
    g.totalEstoque   = g.items.reduce((s, i) => s + i.estoque, 0)
    g.totalVendas15d = g.items.reduce((s, i) => s + i.vendas15d, 0)
    g.totalSugerido  = g.items.reduce((s, i) => s + i.sugerido, 0)
    g.piorUrgencia   = g.items.reduce(
      (pior, i) => URGENCIA_ORDER[i.urgencia] < URGENCIA_ORDER[pior] ? i.urgencia : pior,
      'sem_saida' as ItemCompra['urgencia'],
    )
  }

  // Ordena grupos: pior urgência primeiro, depois nome do modelo
  return Array.from(grupoMap.values()).sort((a, b) =>
    URGENCIA_ORDER[a.piorUrgencia] - URGENCIA_ORDER[b.piorUrgencia] ||
    a.modelo.localeCompare(b.modelo)
  )
}

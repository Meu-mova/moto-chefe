import { db } from '@/lib/db'
import { pedidosFabricaAlerta, lojas, grupos, fabricaSyncLoja } from '@/lib/db/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'

export type PedidoFabricaPendente = {
  numeroPedido: string
  loja: string
  valor: number | null
  dataPedido: string | null
  /** Dias desde que o pedido foi visto pela primeira vez. */
  dias: number
}

export type LeituraLoja = {
  loja: string
  status: 'ok' | 'sem_credencial' | 'erro' | 'nunca'
  executadoEm: Date | null
}

export type PedidosFabricaDoGrupo = {
  pendentes: PedidoFabricaPendente[]
  total: number
  valorTotal: number
  /** Lojas cuja conta da fábrica não está sendo lida — o zero delas não é zero. */
  lojasSemLeitura: LeituraLoja[]
  /** Leitura mais recente entre as lojas do grupo. */
  ultimaLeitura: Date | null
}

function dias(de: Date, ate: Date): number {
  const a = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate())
  const b = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate())
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/**
 * Pedidos de peças aguardando pagamento na fábrica, por grupo.
 *
 * Lê a tabela alimentada pelo cron — nada de scraping no caminho da página, que
 * levaria um login por loja no portal da fábrica.
 *
 * Devolve junto a cobertura da leitura: loja sem credencial ou com erro aparece
 * como zero pedidos, e sem esse aviso o card diria "está tudo pago" quando a
 * verdade é "ninguém olhou".
 */
export async function pedidosFabricaDoGrupo(
  grupoId: string,
  agora: Date = new Date(),
): Promise<PedidosFabricaDoGrupo> {
  const linhas = await db
    .select({
      numeroPedido: pedidosFabricaAlerta.numeroPedido,
      valor:        pedidosFabricaAlerta.valor,
      dataPedido:   pedidosFabricaAlerta.dataPedido,
      desde:        pedidosFabricaAlerta.primeiroAlertaEm,
      loja:         lojas.nome,
    })
    .from(pedidosFabricaAlerta)
    .innerJoin(lojas, eq(pedidosFabricaAlerta.lojaId, lojas.id))
    .where(and(
      eq(pedidosFabricaAlerta.grupoId, grupoId),
      isNull(pedidosFabricaAlerta.resolvidoEm),
    ))
    .orderBy(asc(pedidosFabricaAlerta.primeiroAlertaEm))

  const leituras = await db
    .select({
      loja:        lojas.nome,
      status:      fabricaSyncLoja.status,
      executadoEm: fabricaSyncLoja.executadoEm,
    })
    .from(lojas)
    .leftJoin(fabricaSyncLoja, eq(fabricaSyncLoja.lojaId, lojas.id))
    .where(and(eq(lojas.grupoId, grupoId), eq(lojas.ativa, true)))
    .orderBy(asc(lojas.nome))

  const pendentes = linhas.map(l => ({
    numeroPedido: l.numeroPedido,
    loja:         l.loja,
    valor:        l.valor != null ? Number(l.valor) : null,
    dataPedido:   l.dataPedido,
    dias:         dias(new Date(l.desde), agora),
  }))

  const lojasSemLeitura: LeituraLoja[] = leituras
    .filter(l => l.status !== 'ok')
    .map(l => ({
      loja: l.loja,
      status: (l.status as LeituraLoja['status']) ?? 'nunca',
      executadoEm: l.executadoEm ?? null,
    }))

  const datas = leituras.map(l => l.executadoEm).filter((d): d is Date => !!d)

  return {
    pendentes,
    total: pendentes.length,
    valorTotal: pendentes.reduce((a, p) => a + (p.valor ?? 0), 0),
    lojasSemLeitura,
    ultimaLeitura: datas.length > 0 ? new Date(Math.max(...datas.map(d => d.getTime()))) : null,
  }
}

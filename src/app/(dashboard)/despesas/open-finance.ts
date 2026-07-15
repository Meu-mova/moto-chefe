import { db } from '@/lib/db'
import { despesasOpenFinance, despesasOfSyncStatus, lojas, usuarios } from '@/lib/db/schema'
import { buscarSaidasOpenFinance } from '@/lib/mcpai'
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm'

// Mesma janela de cache do PIX (teste) — é a mesma conexão com o mcp.ai, mas
// com marcador de staleness próprio (despesas_of_sync_status), separado do
// pix_mcp_sync_status — as duas sincronizações escrevem em tabelas diferentes
// e não podem compartilhar o mesmo controle de cache.
const JANELA_CACHE_MS = 10 * 60 * 1000

export type SaidaComDetalhes = typeof despesasOpenFinance.$inferSelect & {
  lojaNome: string | null
  lancadoPorNome: string | null
}

export async function sincronizarEBuscarSaidas(
  grupo: { id: string; cnpj: string },
  fromDate: Date,
  toDate: Date,
  forcarSync: boolean,
): Promise<{ linhas: SaidaComDetalhes[]; erroSync: string | null; syncStatusAtual: { ultimaSincronizacao: Date } | null }> {
  const [syncStatus] = await db.select().from(despesasOfSyncStatus).where(eq(despesasOfSyncStatus.grupoId, grupo.id)).limit(1)
  const cacheValido = !forcarSync && syncStatus && (Date.now() - syncStatus.ultimaSincronizacao.getTime()) < JANELA_CACHE_MS

  let erroSync: string | null = null

  if (!cacheValido) {
    const desde = new Date('2025-01-01T00:00:00.000Z')
    const resultado = await buscarSaidasOpenFinance(desde, new Date(), grupo.cnpj)

    if (!resultado.ok) {
      erroSync = resultado.erro
    } else {
      if (resultado.transacoes.length > 0) {
        await db.insert(despesasOpenFinance)
          .values(resultado.transacoes.map(tx => ({
            grupoId: grupo.id,
            contaId: tx.contaId,
            banco: tx.banco,
            transacaoId: tx.transacaoId,
            data: new Date(tx.data),
            valor: tx.valor,
            favorecidoNome: tx.favorecidoNome,
            descricao: tx.descricao,
            tipoOperacao: tx.tipoOperacao,
          })))
          .onConflictDoNothing({ target: despesasOpenFinance.transacaoId })
      }
      await db.insert(despesasOfSyncStatus)
        .values({ grupoId: grupo.id, ultimaSincronizacao: new Date() })
        .onConflictDoUpdate({ target: despesasOfSyncStatus.grupoId, set: { ultimaSincronizacao: new Date() } })
    }
  }

  const [syncStatusAtual] = await db.select().from(despesasOfSyncStatus).where(eq(despesasOfSyncStatus.grupoId, grupo.id)).limit(1)

  const linhasRaw = await db
    .select()
    .from(despesasOpenFinance)
    .where(and(
      eq(despesasOpenFinance.grupoId, grupo.id),
      gte(despesasOpenFinance.data, fromDate),
      lte(despesasOpenFinance.data, toDate),
    ))
    .orderBy(desc(despesasOpenFinance.data))

  const lojaIds = linhasRaw.map(l => l.lojaId).filter((id): id is string => !!id)
  const lancadoPorIds = linhasRaw.map(l => l.lancadoPorId).filter((id): id is string => !!id)

  const [lojasDb, usuariosDb] = await Promise.all([
    lojaIds.length > 0
      ? db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).where(inArray(lojas.id, lojaIds))
      : Promise.resolve([] as { id: string; nome: string }[]),
    lancadoPorIds.length > 0
      ? db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(inArray(usuarios.id, lancadoPorIds))
      : Promise.resolve([] as { id: string; nome: string }[]),
  ])
  const lojaNomeById = new Map(lojasDb.map(l => [l.id, l.nome]))
  const usuarioNomeById = new Map(usuariosDb.map(u => [u.id, u.nome]))

  const linhas: SaidaComDetalhes[] = linhasRaw.map(l => ({
    ...l,
    lojaNome: l.lojaId ? lojaNomeById.get(l.lojaId) ?? null : null,
    lancadoPorNome: l.lancadoPorId ? usuarioNomeById.get(l.lancadoPorId) ?? null : null,
  }))

  return { linhas, erroSync, syncStatusAtual: syncStatusAtual ?? null }
}

import { db } from '@/lib/db'
import { despesasOpenFinance, despesasOfSyncStatus, despesas, lojas, usuarios } from '@/lib/db/schema'
import { buscarSaidasOpenFinance } from '@/lib/mcpai'
import { LOJA_GALPAO_MATRIZ_ID } from '@/lib/loja-galpao'
import { eq, and, gte, lte, desc, inArray, isNull } from 'drizzle-orm'

// Mesma janela de cache do PIX (teste) — é a mesma conexão com o mcp.ai, mas
// com marcador de staleness próprio (despesas_of_sync_status), separado do
// pix_mcp_sync_status — as duas sincronizações escrevem em tabelas diferentes
// e não podem compartilhar o mesmo controle de cache.
const JANELA_CACHE_MS = 10 * 60 * 1000

// ─── Regra automática: pedágio Sicoob TAG → categoria "Pedágio", loja Galpão Matriz ──
// Comparação sem acentos/case pra não depender de como o banco formata a descrição.
function normalizarTexto(txt: string): string {
  return txt.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}
const PADRAO_PEDAGIO_SICOOB = normalizarTexto('DÉBITO PEDÁGIO SICOOB TAG')
function ehPedagioSicoobTag(descricao: string | null): boolean {
  return !!descricao && normalizarTexto(descricao).includes(PADRAO_PEDAGIO_SICOOB)
}

// Lança automaticamente (cria a despesa e marca a saída como categorizada) todas as
// saídas pendentes do grupo cuja descrição bate com a regra acima. Só atua se a loja
// Galpão Matriz pertencer ao grupo ativo (ou seja, só no Sul de Minas).
// lancadoPorId fica null de propósito — não foi uma pessoa que categorizou, e o
// usuário logado no momento da sincronização não tem relação com a transação em si.
// A UI mostra "Automático" quando lancadoPorId é null e a saída já está lançada.
async function autoCategorizarPedagioSicoob(grupoId: string, usuarioSistemaId: string) {
  const [galpaoNoGrupo] = await db.select({ id: lojas.id }).from(lojas)
    .where(and(eq(lojas.id, LOJA_GALPAO_MATRIZ_ID), eq(lojas.grupoId, grupoId)))
    .limit(1)
  if (!galpaoNoGrupo) return

  const pendentes = await db.select().from(despesasOpenFinance)
    .where(and(eq(despesasOpenFinance.grupoId, grupoId), isNull(despesasOpenFinance.despesaId)))
  const candidatos = pendentes.filter(p => ehPedagioSicoobTag(p.descricao))

  for (const c of candidatos) {
    await db.transaction(async (tx) => {
      const [despesaCriada] = await tx.insert(despesas).values({
        grupoId,
        lojaId: LOJA_GALPAO_MATRIZ_ID,
        usuarioId: usuarioSistemaId,
        categoria: 'Pedágio',
        descricao: c.descricao,
        valor: c.valor,
        data: c.data.toISOString().split('T')[0],
        formaPagamento: c.tipoOperacao ?? 'Outro',
        banco: c.banco,
      }).returning({ id: despesas.id })

      await tx.update(despesasOpenFinance).set({
        categoria: 'Pedágio',
        lojaId: LOJA_GALPAO_MATRIZ_ID,
        despesaId: despesaCriada.id,
        lancadoPorId: null,
        lancadoEm: new Date(),
      }).where(and(
        eq(despesasOpenFinance.id, c.id),
        isNull(despesasOpenFinance.despesaId),
      ))
    })
  }
}

export type SaidaComDetalhes = typeof despesasOpenFinance.$inferSelect & {
  lojaNome: string | null
  lancadoPorNome: string | null
}

export async function sincronizarEBuscarSaidas(
  grupo: { id: string; cnpj: string },
  fromDate: Date,
  toDate: Date,
  forcarSync: boolean,
  usuarioId: string,
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

  // Roda em toda visita à página (não só quando sincroniza de fato) pra também
  // pegar saídas que já estavam pendentes antes dessa regra existir.
  await autoCategorizarPedagioSicoob(grupo.id, usuarioId)

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

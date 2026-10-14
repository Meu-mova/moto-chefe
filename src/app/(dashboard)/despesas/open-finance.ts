import { db } from '@/lib/db'
import { despesasOpenFinance, despesasOfSyncStatus, despesas, lojas, usuarios } from '@/lib/db/schema'
import { buscarSaidasOpenFinance } from '@/lib/mcpai'
import { LOJA_GALPAO_MATRIZ_ID } from '@/lib/loja-galpao'
import { parearReemissoes } from '@/lib/reemissao-saida'
import { eq, and, gte, lte, desc, inArray, isNull } from 'drizzle-orm'
import { criarMedidor } from '@/lib/db-diag'
import { desdeDoSync, selecionarSumidas, dividirEmLotes } from '@/lib/sync-incremental'

// Mesma janela de cache do PIX (teste) — é a mesma conexão com o mcp.ai, mas
// com marcador de staleness próprio (despesas_of_sync_status), separado do
// pix_mcp_sync_status — as duas sincronizações escrevem em tabelas diferentes
// e não podem compartilhar o mesmo controle de cache.
const JANELA_CACHE_MS = 10 * 60 * 1000

// Sync incremental: pede ao mcp.ai só o que veio depois do último sync, com folga para o atraso com
// que o banco posta e reemite lançamentos (maior atraso medido até aparecer no banco: 12,8 dias).
// O histórico inteiro só vem no primeiro sync do grupo ou com ?sync=completo.
const MARGEM_SYNC_DIAS = 30
const HISTORICO_DESDE = new Date('2025-01-01T00:00:00.000Z')
// 9 parâmetros por linha: 1000 linhas ficam bem abaixo do limite de 65.535 do Postgres.
const LOTE_INSERT = 1000

// ─── Regra automática: pedágio Sicoob TAG → categoria "Pedágio", sem loja ────────────
// O pedágio é da operação toda (motos rodando entre as lojas), não do Galpão. Ele
// ficava carimbado lá e enchia o Galpão de 1.298 linhas de poucos reais, distorcendo
// a despesa daquela unidade. Agora entra como despesa Geral (Empresa).
// Comparação sem acentos/case pra não depender de como o banco formata a descrição.
function normalizarTexto(txt: string): string {
  return txt.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}
const PADRAO_PEDAGIO_SICOOB = normalizarTexto('DÉBITO PEDÁGIO SICOOB TAG')
function ehPedagioSicoobTag(descricao: string | null): boolean {
  return !!descricao && normalizarTexto(descricao).includes(PADRAO_PEDAGIO_SICOOB)
}

// Lança automaticamente (cria a despesa e marca a saída como categorizada) todas as
// saídas pendentes do grupo cuja descrição bate com a regra acima. O Galpão Matriz
// segue sendo consultado só para identificar o grupo — a TAG do Sicoob é do Sul de
// Minas —, mas a despesa em si não é atribuída a ele.
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
        lojaId: null, // despesa da operação, não de uma loja
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
        lojaId: null,
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

// Linha recém-inserida que é só o banco reemitindo uma saída já gravada com ID novo
// (ver reemissao-saida.ts). A linha antiga fica — é ela que carrega a categoria e a
// despesa lançada — e assume o ID, a data e a descrição atuais; a nova é descartada.
// Roda antes do auto-categorizador de pedágio, senão ele lançaria a cópia.
async function absorverReemissoes(
  grupoId: string,
  inseridas: (typeof despesasOpenFinance.$inferSelect)[],
  idsNoBanco: Set<string>,
  desde: Date,
) {
  if (inseridas.length === 0) return

  const UM_DIA_MS = 24 * 60 * 60 * 1000
  const tempos = inseridas.map(i => i.data.getTime())
  const idsInseridas = new Set(inseridas.map(i => i.id))
  const vizinhas = await db.select().from(despesasOpenFinance).where(and(
    eq(despesasOpenFinance.grupoId, grupoId),
    inArray(despesasOpenFinance.contaId, [...new Set(inseridas.map(i => i.contaId))]),
    gte(despesasOpenFinance.data, new Date(Math.min(...tempos) - UM_DIA_MS)),
    lte(despesasOpenFinance.data, new Date(Math.max(...tempos) + UM_DIA_MS)),
  ))
  const sumidas = selecionarSumidas(vizinhas, idsInseridas, idsNoBanco, desde)

  const porId = new Map(inseridas.map(i => [i.id, i]))
  for (const { nova, antiga } of parearReemissoes(inseridas, sumidas)) {
    const n = porId.get(nova.id)!
    await db.transaction(async (tx) => {
      await tx.delete(despesasOpenFinance).where(eq(despesasOpenFinance.id, n.id))
      await tx.update(despesasOpenFinance).set({
        transacaoId: n.transacaoId,
        data: n.data,
        descricao: n.descricao,
        favorecidoNome: n.favorecidoNome,
        tipoOperacao: n.tipoOperacao,
      }).where(eq(despesasOpenFinance.id, antiga.id))
    })
  }
}

export type SaidaComDetalhes = typeof despesasOpenFinance.$inferSelect & {
  lojaNome: string | null
  lancadoPorNome: string | null
  /** A quem se destinou, lido da despesa que esta saída gerou. Null enquanto ela
   *  não foi categorizada, ou quando a categoria não pede beneficiário. */
  beneficiario: string | null
}

/** normal: respeita o cache de 10 min; forcado: ignora o cache (incremental); completo: histórico inteiro. */
export type ModoSync = 'normal' | 'forcado' | 'completo'

export async function sincronizarEBuscarSaidas(
  grupo: { id: string; cnpj: string },
  fromDate: Date,
  toDate: Date,
  modoSync: ModoSync,
  usuarioId: string,
): Promise<{ linhas: SaidaComDetalhes[]; erroSync: string | null; contasPuladas: string[]; syncStatusAtual: { ultimaSincronizacao: Date } | null }> {
  // Diagnóstico de lentidão (#129): um log por etapa, assim que ela termina. Sem valores, nomes nem ids.
  const medir = criarMedidor('despesas-tempo')
  const [syncStatus] = await db.select().from(despesasOfSyncStatus).where(eq(despesasOfSyncStatus.grupoId, grupo.id)).limit(1)
  const cacheValido = modoSync === 'normal' && syncStatus && (Date.now() - syncStatus.ultimaSincronizacao.getTime()) < JANELA_CACHE_MS

  let erroSync: string | null = null
  let contasPuladas: string[] = []
  const desde = modoSync === 'completo' ? HISTORICO_DESDE : desdeDoSync(syncStatus?.ultimaSincronizacao ?? null, MARGEM_SYNC_DIAS, HISTORICO_DESDE)
  console.log('[despesas-tempo]', `etapa=cache valido=${Boolean(cacheValido)} modo_sync=${modoSync} desde=${desde.toISOString().slice(0, 10)}`)

  if (!cacheValido) {
    const tBusca = performance.now()
    const resultado = await buscarSaidasOpenFinance(desde, new Date(), grupo.cnpj)
    medir('buscar_mcpai', tBusca)

    if (!resultado.ok) {
      erroSync = resultado.erro
    } else {
      const tGrava = performance.now()
      if (resultado.transacoes.length > 0) {
        const linhasParaGravar = resultado.transacoes.map(tx => ({
          grupoId: grupo.id,
          contaId: tx.contaId,
          banco: tx.banco,
          transacaoId: tx.transacaoId,
          data: new Date(tx.data),
          valor: tx.valor,
          favorecidoNome: tx.favorecidoNome,
          descricao: tx.descricao,
          tipoOperacao: tx.tipoOperacao,
        }))
        // Numa transação: se um lote falha, nenhum fica gravado. Sem isso o retry não devolveria as linhas
        // dos lotes que já entraram (onConflictDoNothing), e o absorverReemissoes nunca olharia para elas.
        const inseridas = await db.transaction(async (tx) => {
          const gravadas: (typeof despesasOpenFinance.$inferSelect)[] = []
          for (const lote of dividirEmLotes(linhasParaGravar, LOTE_INSERT)) {
            gravadas.push(...await tx.insert(despesasOpenFinance)
              .values(lote)
              .onConflictDoNothing({ target: despesasOpenFinance.transacaoId })
              .returning())
          }
          return gravadas
        })
        medir('inserir_saidas', tGrava)
        const tReemissoes = performance.now()
        await absorverReemissoes(grupo.id, inseridas, new Set(resultado.transacoes.map(t => t.transacaoId)), desde)
        medir('absorver_reemissoes', tReemissoes)
      }
      contasPuladas = resultado.contasPuladas
      // Conta pulada = o que ela trouxe de novo ficou de fora. Não avança a data do sync (o próximo
      // sync relê a mesma janela e recupera a lacuna) e também não vale o cache de 10 min: sem a data
      // nova, a próxima visita sincroniza de novo até a conta voltar. A tela avisa (contasPuladas).
      if (contasPuladas.length === 0) {
        await db.insert(despesasOfSyncStatus)
          .values({ grupoId: grupo.id, ultimaSincronizacao: new Date() })
          .onConflictDoUpdate({ target: despesasOfSyncStatus.grupoId, set: { ultimaSincronizacao: new Date() } })
      }
      medir('gravar_no_banco', tGrava)
    }
  }

  // Roda em toda visita à página (não só quando sincroniza de fato) pra também
  // pegar saídas que já estavam pendentes antes dessa regra existir.
  const tPedagio = performance.now()
  await autoCategorizarPedagioSicoob(grupo.id, usuarioId)
  medir('auto_pedagio', tPedagio)

  const [syncStatusAtual] = await db.select().from(despesasOfSyncStatus).where(eq(despesasOfSyncStatus.grupoId, grupo.id)).limit(1)

  const tLinhas = performance.now()
  const linhasRaw = await db
    .select()
    .from(despesasOpenFinance)
    .where(and(
      eq(despesasOpenFinance.grupoId, grupo.id),
      gte(despesasOpenFinance.data, fromDate),
      lte(despesasOpenFinance.data, toDate),
    ))
    .orderBy(desc(despesasOpenFinance.data))
  medir('consultar_linhas', tLinhas)

  const lojaIds = linhasRaw.map(l => l.lojaId).filter((id): id is string => !!id)
  const lancadoPorIds = linhasRaw.map(l => l.lancadoPorId).filter((id): id is string => !!id)
  const despesaIds = linhasRaw.map(l => l.despesaId).filter((id): id is string => !!id)

  const [lojasDb, usuariosDb, despesasDb] = await Promise.all([
    lojaIds.length > 0
      ? db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).where(inArray(lojas.id, lojaIds))
      : Promise.resolve([] as { id: string; nome: string }[]),
    lancadoPorIds.length > 0
      ? db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(inArray(usuarios.id, lancadoPorIds))
      : Promise.resolve([] as { id: string; nome: string }[]),
    despesaIds.length > 0
      ? db.select({ id: despesas.id, beneficiario: despesas.beneficiario }).from(despesas).where(inArray(despesas.id, despesaIds))
      : Promise.resolve([] as { id: string; beneficiario: string | null }[]),
  ])
  const lojaNomeById = new Map(lojasDb.map(l => [l.id, l.nome]))
  const usuarioNomeById = new Map(usuariosDb.map(u => [u.id, u.nome]))
  const beneficiarioPorDespesa = new Map(despesasDb.map(d => [d.id, d.beneficiario]))

  const linhas: SaidaComDetalhes[] = linhasRaw.map(l => ({
    ...l,
    lojaNome: l.lojaId ? lojaNomeById.get(l.lojaId) ?? null : null,
    lancadoPorNome: l.lancadoPorId ? usuarioNomeById.get(l.lancadoPorId) ?? null : null,
    beneficiario: l.despesaId ? beneficiarioPorDespesa.get(l.despesaId) ?? null : null,
  }))

  medir('total_sync_e_busca')
  return { linhas, erroSync, contasPuladas, syncStatusAtual: syncStatusAtual ?? null }
}

import { db } from '@/lib/db'
import { pixRecebimentosMcp, pixMcpSyncStatus } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { buscarPixRecebidos } from '@/lib/mcpai'

// Enquanto a última sincronização com o mcp.ai for mais recente que isso, não
// vale sincronizar de novo: o mcp.ai é lento e baixa o histórico inteiro da conta.
export const JANELA_CACHE_PIX_MS = 10 * 60 * 1000

export function cachePixValido(ultimaSincronizacao: Date | undefined, agora = Date.now()) {
  return !!ultimaSincronizacao && agora - ultimaSincronizacao.getTime() < JANELA_CACHE_PIX_MS
}

const tempo = (etapa: string, desde: number, extra = '') =>
  console.log('[pix-tempo]', `etapa=${etapa} ms=${Math.round(performance.now() - desde)}${extra ? ' ' + extra : ''}`)

export type ResultadoSyncPix = { ok: true; contasPuladas: string[] } | { ok: false; erro: string }

export async function sincronizarPix(grupo: { id: string; cnpj: string }): Promise<ResultadoSyncPix> {
  // Sincroniza o histórico inteiro (não dá pra pedir só um período ao
  // mcp.ai — ver nota em buscarPixRecebidos), então usamos uma janela bem
  // ampla aqui pra não perder PIX antigos na primeira sincronização.
  const desde = new Date('2025-01-01T00:00:00.000Z')
  const tBusca = performance.now()
  const resultado = await buscarPixRecebidos(desde, new Date(), grupo.cnpj)
  tempo('buscar_pix_mcpai', tBusca, `ok=${resultado.ok}${resultado.ok ? ` transacoes=${resultado.transacoes.length}` : ''}`)
  if (!resultado.ok) return { ok: false, erro: resultado.erro }

  const tGrava = performance.now()
  if (resultado.transacoes.length > 0) {
    await db.insert(pixRecebimentosMcp)
      .values(resultado.transacoes.map(tx => ({
        grupoId: grupo.id,
        contaId: tx.contaId,
        banco: tx.banco,
        transacaoId: tx.transacaoId,
        data: new Date(tx.data),
        valor: tx.valor,
        pagadorNome: tx.pagadorNome,
        descricao: tx.descricao,
        tipoOperacao: tx.tipoOperacao,
      })))
      // Upsert, não DoNothing: a linha que já entrou precisa poder se
      // corrigir. Foi assim que 50 recebimentos ficaram com o pagador
      // gravado como "Transferência Pix" mesmo depois de a leitura da
      // descrição ser consertada. Só os campos descritivos são
      // reescritos — venda_id/os_id/pedido_id/peca_venda_id/lancado_* NÃO
      // são tocados, então nada que já foi conciliado se perde. E o
      // coalesce impede que um sync que venha sem remetente apague um
      // nome que já temos.
      .onConflictDoUpdate({
        target: pixRecebimentosMcp.transacaoId,
        set: {
          pagadorNome: sql`coalesce(excluded.pagador_nome, ${pixRecebimentosMcp.pagadorNome})`,
          descricao: sql`coalesce(excluded.descricao, ${pixRecebimentosMcp.descricao})`,
          tipoOperacao: sql`coalesce(excluded.tipo_operacao, ${pixRecebimentosMcp.tipoOperacao})`,
        },
      })
  }
  // Conta pulada = leitura incompleta. Grava o que veio, mas não avança a data: senão o
  // cache de 10 min esconderia a conta que faltou, como se o sync tivesse completado.
  if (resultado.contasPuladas.length === 0) await db.insert(pixMcpSyncStatus)
    .values({ grupoId: grupo.id, ultimaSincronizacao: new Date() })
    .onConflictDoUpdate({ target: pixMcpSyncStatus.grupoId, set: { ultimaSincronizacao: new Date() } })
  tempo('gravar_no_banco', tGrava)
  return { ok: true, contasPuladas: resultado.contasPuladas }
}

export async function ultimaSincronizacaoPix(grupoId: string) {
  const [s] = await db.select().from(pixMcpSyncStatus).where(eq(pixMcpSyncStatus.grupoId, grupoId)).limit(1)
  return s?.ultimaSincronizacao
}

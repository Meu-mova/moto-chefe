import { and, eq, isNotNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { modeloAjustes, modelos } from '@/lib/db/schema'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { contaDaLoja } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

/**
 * Preço de compra padrão de cada modelo para a entrada na loja de destino (#513): o ajuste
 * da Conta da loja (`modelo_ajustes`) ou o preço do modelo próprio dela. O padrão da
 * plataforma não entra (#288). Loja de outra Conta recebe a mesma resposta de loja
 * inexistente.
 */
export async function precosPadraoDaLoja(
  usuario: Parameters<typeof podeAbrirRegistroDaLoja>[0],
  lojaId: string,
  exec: Executor = db,
): Promise<{ error: 'Loja não encontrada' } | { precos: Record<string, string> }> {
  if (!(await podeAbrirRegistroDaLoja(usuario, lojaId, exec))) return { error: 'Loja não encontrada' }
  const contaId = await contaDaLoja(lojaId, exec)
  const proprio = eq(modelos.contaId, contaId)
  const linhas = await exec
    .select({
      id: modelos.id,
      preco: sql<string | null>`coalesce(${modeloAjustes.precoCompraPadrao}, case when ${proprio} then ${modelos.precoCompraPadrao} end)`,
    })
    .from(modelos)
    // A Conta no join: o ajuste de outra Conta nunca entra.
    .leftJoin(modeloAjustes, and(eq(modeloAjustes.modeloId, modelos.id), eq(modeloAjustes.contaId, contaId)))
    .where(or(isNotNull(modeloAjustes.precoCompraPadrao), and(proprio, isNotNull(modelos.precoCompraPadrao))))
  return { precos: Object.fromEntries(linhas.filter(l => l.preco).map(l => [l.id, l.preco as string])) }
}

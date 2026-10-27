import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, notagatewayConfig } from '@/lib/db/schema'
import { cifrar } from '@/lib/cripto'

/**
 * Credencial da Nota Gateway do grupo (#446). Só o admin_geral grava: o token
 * emite NF-e em nome do CNPJ e o ambiente decide se a nota vale. O sócio segue
 * com as regras fiscais e a logo do DANFE, mas vê a credencial só para leitura.
 */

type Executor = Pick<typeof db, 'select' | 'update' | 'insert'>

export type CredencialPayload = {
  grupoId: string
  /** Vazio = não mexer no token já gravado (a tela nunca mostra o valor atual). */
  token: string
  ambiente: 'Homologacao' | 'Producao'
  serieNfe: string
  proximoNumero: number
}

export const podeGravarCredencialNg = (papel: string) => papel === 'admin_geral'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * O token é cifrado como o certificado A1 (`src/lib/cripto.ts`) e nunca volta
 * para a tela. O `empresaId` não entra aqui: ele vem da API no cadastro da empresa.
 */
export async function salvarCredencial(
  usuario: { papel: string },
  data: CredencialPayload,
  exec: Executor = db,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!podeGravarCredencialNg(usuario.papel)) return { ok: false, erro: 'Acesso restrito ao Admin Geral' }
  const [g] = UUID.test(data.grupoId)
    ? await exec.select({ id: grupos.id }).from(grupos).where(eq(grupos.id, data.grupoId)).limit(1)
    : []
  if (!g) return { ok: false, erro: 'Grupo não encontrado' }

  const serie = data.serieNfe.trim() || '1'
  const numero = Number.isFinite(data.proximoNumero) && data.proximoNumero > 0 ? Math.trunc(data.proximoNumero) : 1
  const [jaTem] = await exec
    .select({ grupoId: notagatewayConfig.grupoId })
    .from(notagatewayConfig)
    .where(eq(notagatewayConfig.grupoId, data.grupoId))
    .limit(1)
  if (!jaTem && !data.token.trim()) return { ok: false, erro: 'Informe o token da Nota Gateway para configurar este grupo' }

  const comum = { ambiente: data.ambiente, serieNfe: serie, proximoNumero: numero, atualizadoEm: sql`NOW()` as unknown as Date }
  if (jaTem) {
    await exec
      .update(notagatewayConfig)
      .set(data.token.trim() ? { ...comum, token: cifrar(data.token.trim()) } : comum)
      .where(eq(notagatewayConfig.grupoId, data.grupoId))
  } else {
    await exec.insert(notagatewayConfig).values({ grupoId: data.grupoId, token: cifrar(data.token.trim()), ...comum })
  }
  return { ok: true }
}

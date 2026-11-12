import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura } from '@/lib/db/schema'
import type { podeAgirNaLoja } from '@/lib/acesso-registro'
import { vendaEmQueAge } from '@/lib/venda-do-usuario'

type Executor = Pick<typeof db, 'select'>

// Mais fechado que o resto do sistema, de propósito: o dossiê tem a FOTO do cliente.
// Vendedor e aux_adm enviam e acompanham pelo painel da venda, sem abrir o registro
// fotográfico (LGPD: acesso restrito a quem precisa).
const PAPEIS_DOSSIE = new Set(['admin_geral', 'admin_socio'])

/**
 * Documento de assinatura que o usuário pode abrir no dossiê, com a venda, ou null.
 * Documento de outra Conta volta null, igual a id inexistente: a página responde 404
 * nos dois casos, sem revelar que ele existe (#840).
 */
export async function dossieDoUsuario(
  usuario: Parameters<typeof podeAgirNaLoja>[0],
  documentoId: string,
  exec: Executor = db,
) {
  if (!PAPEIS_DOSSIE.has(usuario.papel)) return null
  const [doc] = await exec.select().from(documentosAssinatura)
    .where(eq(documentosAssinatura.id, documentoId)).limit(1)
  if (!doc) return null
  const venda = await vendaEmQueAge(usuario, doc.vendaId, exec)
  return venda ? { doc, venda } : null
}

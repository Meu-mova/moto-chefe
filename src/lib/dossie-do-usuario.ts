import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, vendas } from '@/lib/db/schema'
import type { podeAgirNaLoja } from '@/lib/acesso-registro'
import { vendaEmQueAge, vendasDoEscopo } from '@/lib/venda-do-usuario'

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
  const daConta = vendasDoEscopo(usuario)
  if (daConta === null) return null
  const [linha] = await exec.select({ doc: documentosAssinatura }).from(documentosAssinatura)
    .innerJoin(vendas, eq(vendas.id, documentosAssinatura.vendaId))
    .where(and(eq(documentosAssinatura.id, documentoId), daConta)).limit(1)
  if (!linha) return null
  const { doc } = linha
  const venda = await vendaEmQueAge(usuario, doc.vendaId, exec)
  return venda ? { doc, venda } : null
}

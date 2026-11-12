import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, vendas } from '@/lib/db/schema'
import { podeAgirNaLoja } from '@/lib/acesso-registro'

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
  const [venda] = await exec.select({ lojaId: vendas.lojaId, numero: vendas.numero })
    .from(vendas).where(eq(vendas.id, doc.vendaId)).limit(1)
  if (!venda) return null
  // Venda sem loja não tem Conta para conferir: só admin_geral, como no painel da venda.
  const pode = venda.lojaId
    ? await podeAgirNaLoja(usuario, venda.lojaId, exec)
    : usuario.papel === 'admin_geral'
  return pode ? { doc, venda } : null
}

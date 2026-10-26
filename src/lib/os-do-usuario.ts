import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ordensServico } from '@/lib/db/schema'
import { podeAgirNaLoja } from '@/lib/acesso-registro'

type Executor = Pick<typeof db, 'select'>

/**
 * OS em que o usuário pode agir, ou null. OS de outra Conta (ou de loja que ele não opera)
 * volta null, igual a OS inexistente: quem chama responde "OS não encontrada" nos dois casos,
 * para a frase não revelar que ela existe em outra Conta (#404).
 */
export async function osDoUsuario(
  usuario: Parameters<typeof podeAgirNaLoja>[0],
  osId: string,
  exec: Executor = db,
) {
  const [os] = await exec
    .select({ lojaId: ordensServico.lojaId, status: ordensServico.status })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os || !(await podeAgirNaLoja(usuario, os.lojaId, exec))) return null
  return os
}

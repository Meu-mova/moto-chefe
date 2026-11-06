import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { podeVenderMotoDaLoja } from '@/lib/acesso-registro'
import { lojasDoEscopo } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

/**
 * Moto que o usuário pode vender, reservar ou pedir venda, ou null. A Conta entra no
 * where; a regra de loja (com a exceção do Galpão) vem depois, no podeVenderMotoDaLoja.
 * Moto de outra Conta volta null, igual a moto inexistente: quem chama responde
 * "Moto não encontrada" nos dois casos (#404).
 */
export async function motoDoUsuario(
  usuario: Parameters<typeof podeVenderMotoDaLoja>[0],
  motoId: string,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(motos.lojaId, lojasDoEscopo(usuario)) : null
  if (daConta === null) return null
  const [moto] = await exec.select().from(motos).where(and(eq(motos.id, motoId), daConta)).limit(1)
  if (!moto || !(await podeVenderMotoDaLoja(usuario, moto.lojaId, exec))) return null
  return moto
}

/** Loja da moto que a ação vai gravar (transferência, garantia); null se não existe. A Conta quem chama confere. */
export async function lojaDaMotoParaGravar(motoId: string, exec: Executor = db): Promise<{ lojaId: string } | null> {
  const [moto] = await exec.select({ lojaId: motos.lojaId }).from(motos).where(eq(motos.id, motoId)).limit(1)
  return moto ?? null
}

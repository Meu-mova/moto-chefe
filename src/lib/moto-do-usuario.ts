import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { podeAgirNaLoja, podeVenderMotoDaLoja } from '@/lib/acesso-registro'
import { lojasDoEscopo } from '@/lib/conta'
import { RecusaUsuario } from '@/lib/resultado-action'
import { MOTO_ARQUIVADA } from '@/lib/arquivar-moto-regras'

type Executor = Pick<typeof db, 'select'>

/** Conta no where: undefined = admin_geral (todas), null = sem Conta (nenhuma). */
const daContaDo = (usuario: { papel: string; contaId: string | null; grupoLiberado?: string | null }) =>
  usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(motos.lojaId, lojasDoEscopo(usuario)) : null

/**
 * Moto que o usuário pode vender, reservar ou pedir venda, ou null. A Conta entra no
 * where; a regra de loja (com a exceção do Galpão) vem depois, no podeVenderMotoDaLoja.
 * Moto de outra Conta volta null, igual a moto inexistente: quem chama responde
 * "Moto não encontrada" nos dois casos (#404). Moto arquivada da Conta recusa com a frase
 * que manda desarquivar (#688): não se vende, reserva nem pede.
 */
export async function motoDoUsuario(
  usuario: Parameters<typeof podeVenderMotoDaLoja>[0],
  motoId: string,
  exec: Executor = db,
) {
  const daConta = daContaDo(usuario)
  if (daConta === null) return null
  const [moto] = await exec.select().from(motos).where(and(eq(motos.id, motoId), daConta)).limit(1)
  if (!moto || !(await podeVenderMotoDaLoja(usuario, moto.lojaId, exec))) return null
  if (moto.arquivadaEm) throw new RecusaUsuario(MOTO_ARQUIVADA)
  return moto
}

/**
 * Loja e status da moto que a ação vai gravar (transferência, garantia), ou null se não
 * existe, é de outra Conta ou a pessoa não age na loja dela. A recusa de arquivada vem só
 * depois do acesso: senão a frase revelaria a moto de outra Conta (#688).
 */
export async function lojaDaMotoParaGravar(
  usuario: Parameters<typeof podeAgirNaLoja>[0],
  motoId: string,
  exec: Executor = db,
): Promise<{ lojaId: string; status: typeof motos.$inferSelect.status } | null> {
  const daConta = daContaDo(usuario)
  if (daConta === null) return null
  const [moto] = await exec.select({ lojaId: motos.lojaId, status: motos.status, arquivadaEm: motos.arquivadaEm })
    .from(motos).where(and(eq(motos.id, motoId), daConta)).limit(1)
  if (!moto || !(await podeAgirNaLoja(usuario, moto.lojaId, exec))) return null
  if (moto.arquivadaEm) throw new RecusaUsuario(MOTO_ARQUIVADA)
  return { lojaId: moto.lojaId, status: moto.status }
}

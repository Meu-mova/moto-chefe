import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'

// Marca o 1º acesso do grupo que o usuário está usando (#207). É o grupo ativo, e não
// o da loja, para contar também o sócio sem loja e quem troca de grupo no seletor.

/** O admin_geral implanta o cliente: o acesso dele não inicia a cobrança. */
export function contaComoPrimeiroAcesso(papel: string): boolean {
  return papel !== 'admin_geral'
}

/** Só escreve no banco se o grupo ainda não tem a data; o grupo já vem carregado. */
export function precisaRegistrar(papel: string, grupo: { primeiroAcessoEm: Date | null }): boolean {
  return contaComoPrimeiroAcesso(papel) && grupo.primeiroAcessoEm === null
}

export async function registrarPrimeiroAcesso(grupoId: string): Promise<void> {
  await db.update(grupos).set({ primeiroAcessoEm: new Date() })
    .where(and(eq(grupos.id, grupoId), isNull(grupos.primeiroAcessoEm)))
}

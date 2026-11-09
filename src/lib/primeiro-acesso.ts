import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { criarAdesaoDoGrupo } from '@/lib/mensalidade/adesao'

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

/**
 * O que o layout faz em toda página: se o papel conta e o grupo ativo ainda não tem a data,
 * registra o 1º acesso. O papel é o efetivo: o admin_rede na persona de um grupo liberado entra
 * como admin_socio e conta (decisão do Luis, 09/11/2026, #803).
 */
export async function registrarSePrimeiroAcesso(
  papel: string, grupo: { id: string; primeiroAcessoEm: Date | null }, agora: Date = new Date(),
): Promise<{ adesaoId: string | null }> {
  return precisaRegistrar(papel, grupo) ? registrarPrimeiroAcesso(grupo.id, agora) : { adesaoId: null }
}

/**
 * Grava a data do 1º acesso e, no regime novo, a cobrança da adesão (#803), na mesma transação:
 * se a cobrança falhar, a data também não fica, e o próximo acesso tenta de novo. Devolve o id
 * da adesão criada, para o link do Mercado Pago ser pedido fora daqui.
 */
export async function registrarPrimeiroAcesso(grupoId: string, agora: Date = new Date()): Promise<{ adesaoId: string | null }> {
  return db.transaction(async tx => {
    // Acesso simultâneo espera o outro terminar e já não acha a data nula.
    const marcado = await tx.update(grupos).set({ primeiroAcessoEm: agora })
      .where(and(eq(grupos.id, grupoId), isNull(grupos.primeiroAcessoEm)))
      .returning({ id: grupos.id })
    if (marcado.length === 0) return { adesaoId: null }

    return { adesaoId: await criarAdesaoDoGrupo(tx, grupoId, agora) }
  })
}

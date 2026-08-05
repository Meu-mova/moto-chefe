import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getGrupoAtivo } from '@/lib/grupo'

export type ContaFabrica = {
  lojaId: string
  lojaNome: string
  email: string
  senha: string
}

export type LojaCredencial = {
  id: string
  nome: string
  fabricaEmail: string | null
  fabricaSenha: string | null
}

export type EscopoFabrica = {
  contas: ContaFabrica[]
  /** Lojas do escopo que ainda não têm login cadastrado. Não é erro. */
  semCredencial: string[]
}

/**
 * Quais contas do portal da fábrica o usuário pode usar.
 *
 * Quem está alocado numa loja só enxerga a conta dela: no portal cada loja é um
 * cadastro distinto, e o adm de Varginha não tem o que fazer com a caixa de
 * trocas de Itajuba. Admin sem loja varre o grupo ativo inteiro.
 *
 * Pura de propósito — é aqui que um erro vazaria dado de uma loja pra outra, e
 * é o que os testes cobrem.
 */
export function filtrarContasDoUsuario(
  usuario: { lojaId: string | null },
  lojasDoGrupo: LojaCredencial[],
): EscopoFabrica {
  const noEscopo = usuario.lojaId
    ? lojasDoGrupo.filter(l => l.id === usuario.lojaId)
    : lojasDoGrupo

  const contas: ContaFabrica[] = []
  const semCredencial: string[] = []

  for (const loja of noEscopo) {
    const email = loja.fabricaEmail?.trim()
    const senha = loja.fabricaSenha?.trim()
    if (email && senha) {
      contas.push({ lojaId: loja.id, lojaNome: loja.nome, email, senha })
    } else {
      semCredencial.push(loja.nome)
    }
  }

  return { contas, semCredencial }
}

/** Contas do portal no escopo do usuário, lidas do banco. */
export async function listarContasFabrica(
  usuario: { papel: string; lojaId: string | null },
): Promise<EscopoFabrica> {
  const grupo = await getGrupoAtivo(usuario)
  const doGrupo = await db
    .select({
      id: lojas.id,
      nome: lojas.nome,
      fabricaEmail: lojas.fabricaEmail,
      fabricaSenha: lojas.fabricaSenha,
    })
    .from(lojas)
    .where(and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true)))
    .orderBy(lojas.nome)

  return filtrarContasDoUsuario(usuario, doGrupo)
}

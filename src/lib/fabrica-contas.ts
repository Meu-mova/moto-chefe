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

const PAPEIS_GRUPO_INTEIRO = ['admin_geral', 'admin_socio']

/**
 * Quais contas do portal da fábrica o usuário pode usar.
 *
 * Quem opera a loja só enxerga a conta dela: no portal cada loja é um cadastro
 * distinto, e o adm de Varginha não tem o que fazer com a caixa de trocas de
 * Itajuba. Admin e sócio varrem o grupo ativo inteiro.
 *
 * O escopo sai do papel, não de ter `lojaId`: sócio tem loja fixa cadastrada, e
 * escopar pela loja o prenderia a ela — e o deixaria sem conta nenhuma ao trocar
 * de grupo, porque a loja fixa dele não está no grupo aberto.
 *
 * Pura de propósito — é aqui que um erro vazaria dado de uma loja pra outra, e
 * é o que os testes cobrem.
 */
export function filtrarContasDoUsuario(
  usuario: { papel: string; lojaId: string | null },
  lojasDoGrupo: LojaCredencial[],
): EscopoFabrica {
  const noEscopo = PAPEIS_GRUPO_INTEIRO.includes(usuario.papel)
    ? lojasDoGrupo
    : lojasDoGrupo.filter(l => l.id === usuario.lojaId)

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

/**
 * Qual loja tem a conta do portal que enxerga o pedido desta garantia.
 *
 * Normalmente é a conta da própria loja da garantia, mas o histórico anterior à
 * separação dos logins (05/08/2026) ficou inteiro na conta antiga — a de Pouso
 * Alegre —, inclusive os pedidos de Varginha e Itajuba. `fabricaContaLojaId`
 * guarda essa exceção; quando está nulo, vale a loja da garantia.
 *
 * Existe para que a regra viva num lugar só: o Sincronizar agrupa as garantias
 * por aqui em vez de repetir o `coalesce` em SQL.
 */
export function lojaDaContaDaGarantia(
  garantia: { lojaId: string; fabricaContaLojaId: string | null },
): string {
  return garantia.fabricaContaLojaId ?? garantia.lojaId
}

/** Contas do portal no escopo do usuário, lidas do banco. */
export async function listarContasFabrica(
  usuario: { papel: string; lojaId: string | null; contaId: string | null },
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

/**
 * Maquininhas de cartão do grupo (#460): opção de cliente é dado do grupo, lida por aqui e
 * conferida no servidor. A loja só vê e só grava as do grupo dela.
 */
import { and, asc, eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { maquininhas } from '@/lib/db/schema'
import { RecusaUsuario } from '@/lib/resultado-action'

type Executor = Pick<typeof db, 'select'>

export type Maquininha = { operadora: string; nome: string }

// A coluna fica fora da subconsulta, então casa com maquininhas e não com lojas.grupo_id.
const doGrupoDaLoja = (lojaId: string) =>
  sql`${maquininhas.grupoId} = (select l.grupo_id from lojas l where l.id = ${lojaId})`

export async function maquininhasDaLoja(exec: Executor, lojaId: string): Promise<Maquininha[]> {
  return exec.select({ operadora: maquininhas.operadora, nome: maquininhas.nome }).from(maquininhas)
    .where(and(doGrupoDaLoja(lojaId), eq(maquininhas.ativo, true)))
    .orderBy(asc(maquininhas.nome))
}

/**
 * Recusa pagamento com maquininha que não é do grupo da loja. A mesma frase para a de outro
 * grupo e para a inexistente. `jaGravadas`: operadoras que o registro já tinha, aceitas na
 * edição para a venda antiga continuar editável.
 */
export async function conferirMaquininhas(
  exec: Executor, lojaId: string, pagamentos: { operadora?: string | null }[], jaGravadas: string[] = [],
): Promise<void> {
  const pedidas = [...new Set(pagamentos.map(p => p.operadora).filter((o): o is string => !!o))]
    .filter(o => !jaGravadas.includes(o))
  if (pedidas.length === 0) return
  const doGrupo = new Set((await maquininhasDaLoja(exec, lojaId)).map(m => m.operadora))
  if (pedidas.some(o => !doGrupo.has(o))) throw new RecusaUsuario('Maquininha não encontrada')
}

/** Operadoras gravadas num jsonb `pagamentos` (para a exceção da edição). */
export function operadorasGravadas(pagamentos: unknown): string[] {
  if (!Array.isArray(pagamentos)) return []
  return pagamentos.map(p => (p as { operadora?: unknown })?.operadora).filter((o): o is string => typeof o === 'string' && !!o)
}

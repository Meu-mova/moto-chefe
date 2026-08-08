import { db } from '@/lib/db'
import { origensVenda } from '@/lib/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import type { OrigemParaValidar } from '@/lib/origem-venda'

export type OrigemParaEscolher = {
  id: string
  nome: string
  tipo: string
  pedeDetalhe: boolean
}

/** O que o select da venda mostra: só as ativas do grupo, agrupáveis por tipo. */
export async function listarOrigensAtivasDoGrupo(grupoId: string): Promise<OrigemParaEscolher[]> {
  return db
    .select({
      id: origensVenda.id,
      nome: origensVenda.nome,
      tipo: origensVenda.tipo,
      pedeDetalhe: origensVenda.pedeDetalhe,
    })
    .from(origensVenda)
    .where(and(eq(origensVenda.grupoId, grupoId), eq(origensVenda.ativo, true)))
    .orderBy(asc(origensVenda.tipo), asc(origensVenda.ordem), asc(origensVenda.nome))
}

/** Tudo que `validarOrigemVenda` precisa saber sobre a origem que o formulário mandou. */
export async function buscarOrigemParaValidar(
  origemId: string | null | undefined,
): Promise<OrigemParaValidar | undefined> {
  if (!origemId) return undefined
  const [origem] = await db
    .select({
      id: origensVenda.id,
      ativo: origensVenda.ativo,
      grupoId: origensVenda.grupoId,
      pedeDetalhe: origensVenda.pedeDetalhe,
    })
    .from(origensVenda)
    .where(eq(origensVenda.id, origemId))
    .limit(1)
  return origem
}

/** O catálogo inteiro do grupo, para o Admin — inclui as desativadas. */
export async function listarOrigensDoGrupo(grupoId: string) {
  return db
    .select()
    .from(origensVenda)
    .where(eq(origensVenda.grupoId, grupoId))
    .orderBy(asc(origensVenda.tipo), asc(origensVenda.ordem), asc(origensVenda.nome))
}

// Dados do seletor de empresa (#517): parte SÓ dos grupos que o usuário já pode ver
// (listarGruposVisiveis). Nenhuma consulta daqui alcança grupo fora dessa lista.
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import type { GrupoDoSeletor } from '@/lib/blocos-seletor'

type Executor = Pick<typeof db, 'select'>
type GrupoVisivel = { id: string; nome: string; cor: string | null; contaId: string; cnpj: string; cidadeSede: string | null }

export async function gruposParaOSeletor(
  visiveis: GrupoVisivel[],
  contas: Map<string, string>,
  exec: Executor = db,
): Promise<GrupoDoSeletor[]> {
  const ids = visiveis.map(g => g.id)
  // Lojas ativas, para a busca; sem cidade da sede, vale a da primeira loja (em ordem de nome).
  const cidades = new Map<string, string>()
  const nomesLojas = new Map<string, string[]>()
  if (ids.length) {
    const linhas = await exec.select({ grupoId: lojas.grupoId, nome: lojas.nome, cidade: lojas.cidade }).from(lojas)
      .where(and(inArray(lojas.grupoId, ids), eq(lojas.ativa, true))).orderBy(asc(lojas.nome))
    for (const l of linhas) {
      if (!cidades.has(l.grupoId)) cidades.set(l.grupoId, l.cidade)
      nomesLojas.set(l.grupoId, [...(nomesLojas.get(l.grupoId) ?? []), l.nome])
    }
  }
  return visiveis.map(g => ({
    id: g.id, nome: g.nome, cor: g.cor, contaId: g.contaId, contaNome: contas.get(g.contaId) ?? '',
    cidade: g.cidadeSede || cidades.get(g.id) || null, cnpj: g.cnpj, lojas: nomesLojas.get(g.id) ?? [],
  }))
}

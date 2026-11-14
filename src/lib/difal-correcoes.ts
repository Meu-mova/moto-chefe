import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { difalUfCorrecoes } from '@/lib/db/schema'
import { podeUsuarioVerGrupo } from '@/lib/grupo'
import { podeConfigurarFiscal } from '@/app/(dashboard)/vendas/papeis-nf-saida'
import { percentualValido, siglaUfValida, type BaseDifal, type CorrecaoUf } from '@/lib/notagateway/difal-ufs'
import { ehUuid } from '@/lib/uuid'

/**
 * Correção do grupo sobre a tabela padrão do DIFAL (#904). Mesma permissão da Tributação de
 * saída (admin/notas-fiscais/actions.ts): papel fiscal e grupo que o usuário vê. A correção
 * vale só para o grupo dela: toda leitura e gravação leva o grupo no where.
 */

type Executor = Pick<typeof db, 'select' | 'insert' | 'delete'>
export type UsuarioDifal = Parameters<typeof podeUsuarioVerGrupo>[0] & { id: string }
export type Resultado = { ok: true } | { ok: false; erro: string }

export type CorrecaoDoGrupo = CorrecaoUf & { grupoId: string }

/** Correções só dos grupos pedidos (os que a tela já sabe que o usuário vê). */
export async function correcoesDosGrupos(grupoIds: readonly string[], exec: Executor = db): Promise<CorrecaoDoGrupo[]> {
  if (grupoIds.length === 0) return []
  const linhas = await exec
    .select({ grupoId: difalUfCorrecoes.grupoId, uf: difalUfCorrecoes.uf, aliquotaInterna: difalUfCorrecoes.aliquotaInterna, fcp: difalUfCorrecoes.fcp, base: difalUfCorrecoes.base })
    .from(difalUfCorrecoes)
    .where(inArray(difalUfCorrecoes.grupoId, [...grupoIds]))
  return linhas.map(l => ({ ...l, aliquotaInterna: Number(l.aliquotaInterna), fcp: Number(l.fcp) }))
}

/** Outra Conta e grupo inexistente recebem a mesma frase. */
async function recusa(usuario: UsuarioDifal, grupoId: string, exec: Executor): Promise<string | null> {
  if (!podeConfigurarFiscal(usuario.papel)) return 'Acesso restrito a Admin Geral e Sócio'
  if (!ehUuid(grupoId) || !(await podeUsuarioVerGrupo(usuario, grupoId, exec))) return 'Grupo não encontrado'
  return null
}

export type DadosCorrecao = { grupoId: string; uf: string; aliquotaInterna: number; fcp: number; base: BaseDifal }

export async function salvarCorrecaoUf(usuario: UsuarioDifal, dados: DadosCorrecao, exec: Executor = db): Promise<Resultado> {
  const erro = await recusa(usuario, dados.grupoId, exec)
  if (erro) return { ok: false, erro }
  const uf = siglaUfValida(dados.uf)
  if (!uf) return { ok: false, erro: 'Estado inválido' }
  if (!percentualValido(dados.aliquotaInterna)) return { ok: false, erro: 'Alíquota interna: use um número de 0 a 100, com até 2 casas' }
  if (!percentualValido(dados.fcp)) return { ok: false, erro: 'FCP: use um número de 0 a 100, com até 2 casas' }
  if (dados.base !== 'unica' && dados.base !== 'dupla') return { ok: false, erro: 'Base: escolha única ou dupla' }

  const valores = { aliquotaInterna: String(dados.aliquotaInterna), fcp: String(dados.fcp), base: dados.base, atualizadoPor: usuario.id, atualizadoEm: sql`now()` as unknown as Date }
  await exec
    .insert(difalUfCorrecoes)
    .values({ grupoId: dados.grupoId, uf, ...valores })
    .onConflictDoUpdate({ target: [difalUfCorrecoes.grupoId, difalUfCorrecoes.uf], set: valores, setWhere: eq(difalUfCorrecoes.grupoId, dados.grupoId) })
  return { ok: true }
}

export async function voltarAoPadraoUf(usuario: UsuarioDifal, dados: { grupoId: string; uf: string }, exec: Executor = db): Promise<Resultado> {
  const erro = await recusa(usuario, dados.grupoId, exec)
  if (erro) return { ok: false, erro }
  const uf = siglaUfValida(dados.uf)
  if (!uf) return { ok: false, erro: 'Estado inválido' }
  await exec.delete(difalUfCorrecoes).where(and(eq(difalUfCorrecoes.grupoId, dados.grupoId), eq(difalUfCorrecoes.uf, uf)))
  return { ok: true }
}

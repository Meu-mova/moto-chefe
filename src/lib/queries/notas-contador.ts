import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, logAcoes } from '@/lib/db/schema'
import { notasParaBaixar, type NotaEmitida } from '@/lib/queries/notas-emitidas'

type Executor = Pick<typeof db, 'select' | 'update'>

/** `contaId` null só para admin_geral; fora isso, o grupo precisa ser da Conta, conferido na própria consulta. */
type GrupoDaConta = { grupoId: string; contaId: string | null }

const doGrupo = (g: GrupoDaConta) =>
  and(eq(grupos.id, g.grupoId), g.contaId === null ? undefined : eq(grupos.contaId, g.contaId))

/** Ao contador vai só produção, autorizadas e canceladas (#402), qualquer que seja o filtro da tela. */
export async function notasParaContador(filtro: GrupoDaConta & { de: string; ate: string }, exec: Executor = db): Promise<NotaEmitida[]> {
  return notasParaBaixar({ ...filtro, ambiente: 'Producao' }, { situacao: 'todas', ids: [] }, exec)
}

export async function emailDoContador(g: GrupoDaConta, exec: Executor = db): Promise<string | null> {
  const [l] = await exec.select({ email: grupos.emailContador }).from(grupos).where(doGrupo(g)).limit(1)
  return l?.email ?? null
}

/** false: o grupo não é da Conta (nada gravado). */
export async function salvarEmailDoContador(g: GrupoDaConta & { email: string }, exec: Executor = db): Promise<boolean> {
  const gravados = await exec.update(grupos).set({ emailContador: g.email }).where(doGrupo(g)).returning({ id: grupos.id })
  return gravados.length > 0
}

export type UltimoEnvio = { em: string; para: string; notas: number }

export async function ultimoEnvioAoContador(g: GrupoDaConta, exec: Executor = db): Promise<UltimoEnvio | null> {
  const [l] = await exec
    .select({ em: logAcoes.criadoEm, detalhe: logAcoes.detalhe })
    .from(logAcoes)
    .innerJoin(grupos, eq(grupos.id, logAcoes.grupoId))
    .where(and(eq(logAcoes.tipo, 'notas_enviadas_contador'), doGrupo(g)))
    .orderBy(desc(logAcoes.criadoEm))
    .limit(1)
  if (!l) return null
  const d = l.detalhe ?? {}
  return { em: l.em.toISOString(), para: String(d.para ?? '?'), notas: Number(d.notas ?? 0) }
}

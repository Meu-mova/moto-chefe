import { lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { logAcoes } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'

// Log de acessos e ações sensíveis (#198). Quem chama nunca deve falhar por causa
// do log: use registrarSemFalhar fora de teste.

export const TIPOS_LOG = ['login', 'troca_grupo', 'acesso_dia'] as const
export type TipoLog = (typeof TIPOS_LOG)[number]

export type Origem = { ip: string | null; userAgent: string | null }

export type RegistroLog = Origem & {
  tipo: TipoLog
  usuarioId: string
  contaId: string | null
  grupoId: string | null
  detalhe?: Record<string, unknown>
}

type Executor = Pick<typeof db, 'insert' | 'delete'>

const MAX_USER_AGENT = 500

/** Na Vercel o IP do cliente é o primeiro do x-forwarded-for. */
export function origemDaRequisicao(h: Headers): Origem {
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || null
  const userAgent = h.get('user-agent')?.slice(0, MAX_USER_AGENT) || null
  return { ip, userAgent }
}

export async function registrarAcao(r: RegistroLog, executor: Executor = db): Promise<void> {
  await executor.insert(logAcoes).values({
    tipo: r.tipo,
    usuarioId: r.usuarioId,
    contaId: r.contaId,
    grupoId: r.grupoId,
    detalhe: r.detalhe ?? null,
    ip: r.ip,
    userAgent: r.userAgent,
    dia: hojeBrt(),
  }).onConflictDoNothing()
}

/** Para o login, a troca de grupo e o layout: erro no log vira só console.error. */
export async function registrarSemFalhar(r: RegistroLog): Promise<void> {
  try {
    await registrarAcao(r)
  } catch (e) {
    console.error(`[log-acoes] falha ao registrar ${r.tipo}:`, e instanceof Error ? e.message : e)
  }
}

/** Apaga o que passou de 12 meses; devolve quantas linhas saíram. */
export async function apagarLogAntigo(executor: Executor = db): Promise<number> {
  const apagadas = await executor.delete(logAcoes)
    .where(lt(logAcoes.criadoEm, sql`now() - interval '12 months'`))
    .returning({ id: logAcoes.id })
  return apagadas.length
}

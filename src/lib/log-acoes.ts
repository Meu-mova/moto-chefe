import { eq, lt, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { grupos, lojas, logAcoes } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'

// Log de acessos e ações sensíveis (#198). Quem chama nunca deve falhar por causa
// do log: use registrarSemFalhar fora de teste.

export const TIPOS_LOG = [
  'login', 'troca_grupo', 'acesso_dia',
  'venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada',
  'certificado_aplicado', 'portal_aplicado', 'notas_enviadas_contador',
  'logo_danfe_enviada', 'preco_compra_alterado', 'transferencia_grupos_alterada',
] as const
export type TipoLog = (typeof TIPOS_LOG)[number]

export type Origem = { ip: string | null; userAgent: string | null }

export type RegistroLog = Origem & {
  tipo: TipoLog
  usuarioId: string
  contaId: string | null
  grupoId: string | null
  detalhe?: Record<string, unknown>
}

type Executor = Pick<typeof db, 'insert' | 'delete' | 'select'>

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

export type AcaoSensivel = {
  tipo: Extract<TipoLog, 'venda_cancelada' | 'nf_emitida' | 'nf_cancelada' | 'permissao_alterada' | 'certificado_aplicado' | 'portal_aplicado' | 'notas_enviadas_contador' | 'logo_danfe_enviada' | 'preco_compra_alterado' | 'transferencia_grupos_alterada'>
  usuarioId: string
  /** Grupo do registro (grupo da nota); nunca o grupo ativo da sessão. */
  grupoId?: string | null
  /** Ou a loja do registro (loja da venda): o grupo sai dela. */
  lojaId?: string | null
  /** Só quando não há grupo: a Conta do usuário-alvo de uma mudança de permissão. */
  contaId?: string | null
  detalhe: Record<string, unknown>
}

async function origemDaRequisicaoAtual(): Promise<Origem> {
  try {
    return origemDaRequisicao(await headers())
  } catch {
    // Fora de uma requisição (teste, script) não há cabeçalho.
    return { ip: null, userAgent: null }
  }
}

export async function registrarAcaoSensivel(a: AcaoSensivel, executor: Executor = db): Promise<void> {
  let grupoId = a.grupoId ?? null
  if (!grupoId && a.lojaId) {
    const [l] = await executor.select({ grupoId: lojas.grupoId }).from(lojas).where(eq(lojas.id, a.lojaId)).limit(1)
    grupoId = l?.grupoId ?? null
  }
  let contaId = a.contaId ?? null
  if (grupoId) {
    const [g] = await executor.select({ contaId: grupos.contaId }).from(grupos).where(eq(grupos.id, grupoId)).limit(1)
    contaId = g?.contaId ?? contaId
  }
  await registrarAcao({ tipo: a.tipo, usuarioId: a.usuarioId, detalhe: a.detalhe, grupoId, contaId, ...(await origemDaRequisicaoAtual()) }, executor)
}

/** Para as actions: a ação já aconteceu, e erro no log não pode desfazer a resposta. */
export async function registrarAcaoSensivelSemFalhar(a: AcaoSensivel): Promise<void> {
  try {
    await registrarAcaoSensivel(a)
  } catch (e) {
    console.error(`[log-acoes] falha ao registrar ${a.tipo}:`, e instanceof Error ? e.message : e)
  }
}

export type Permissoes = {
  papel: string
  lojaId: string | null
  gruposAcesso: string[]
  gruposAprovacao: string[]
  aprovaPagamentoSensivel: boolean
  modulosExtras: string[]
  modulosBloqueados: string[]
}

/** Nome e e-mail ficam de fora: o log é de permissão, não de cadastro. */
export function camposDePermissaoAlterados(antes: Permissoes, depois: Permissoes): (keyof Permissoes)[] {
  const igual = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b)
    ? [...a].sort().join('\u0000') === [...b].sort().join('\u0000')
    : a === b
  return (Object.keys(antes) as (keyof Permissoes)[]).filter(k => !igual(antes[k], depois[k]))
}

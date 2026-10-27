/**
 * Cargos da Conta (#449, adendo ao ADR-0018): o sócio dá nome e marca módulos. Outra Conta
 * não lê, não edita nem atribui; o admin_geral vê todas.
 */
import { and, asc, count, eq, ne, type SQL, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { cargos, usuarios } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

/** `contaId` é a Conta do grupo ativo da sessão. */
export type QuemGerenciaCargos = { papel: string; contaId: string }

export type DadosCargo = { nome: string; modulos: string[] }
type Resultado = { ok: true } | { ok: false; erro: string }

const NAO_ENCONTRADO = { ok: false, erro: 'Cargo não encontrado' } as const

// Nomes dos papéis fixos como aparecem na tela e como o Cesar fala.
const NOMES_FIXOS = [
  'admin geral', 'admin socio', 'socio', 'aux adm', 'aux. administrativo', 'auxiliar administrativo',
  'vendedor', 'mecanico', 'motorista', 'cargo',
]

function normalizar(nome: string): string {
  return nome.normalize('NFD').replace(/\p{M}/gu, '').replace(/[_\s]+/g, ' ').trim().toLowerCase()
}

function daConta(quem: QuemGerenciaCargos): SQL | undefined {
  return quem.papel === 'admin_geral' ? undefined : eq(cargos.contaId, quem.contaId)
}

async function validar(
  exec: Executor, contaId: string, dados: DadosCargo, podeDar: string[], ignorarId?: string,
): Promise<{ ok: false; erro: string } | { ok: true; nome: string; modulos: string[] }> {
  const nome = dados.nome.replace(/\s+/g, ' ').trim()
  if (!nome) return { ok: false, erro: 'Informe o nome do cargo' }
  if (NOMES_FIXOS.includes(normalizar(nome))) return { ok: false, erro: 'Esse nome é de um cargo fixo do MOVA' }
  if (dados.modulos.some(m => !podeDar.includes(m))) return { ok: false, erro: 'Módulo não disponível para cargo' }
  const [repetido] = await exec.select({ id: cargos.id }).from(cargos)
    .where(and(
      eq(cargos.contaId, contaId),
      sql`lower(${cargos.nome}) = lower(${nome})`,
      ignorarId ? ne(cargos.id, ignorarId) : undefined,
    ))
    .limit(1)
  if (repetido) return { ok: false, erro: 'Já existe um cargo com esse nome' }
  return { ok: true, nome, modulos: [...new Set(dados.modulos)].sort() }
}

export async function listarCargos(exec: Executor, quem: QuemGerenciaCargos) {
  return exec.select().from(cargos).where(daConta(quem)).orderBy(asc(cargos.nome))
}

/** Cargo pelo id só se for da Conta; `null` também para id inexistente. */
export async function cargoDaConta(exec: Executor, contaId: string, id: string) {
  const [cargo] = await exec.select().from(cargos)
    .where(and(eq(cargos.id, id), eq(cargos.contaId, contaId)))
    .limit(1)
  return cargo ?? null
}

export async function criarCargo(
  exec: Executor, quem: QuemGerenciaCargos, dados: DadosCargo, podeDar: string[],
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const valido = await validar(exec, quem.contaId, dados, podeDar)
  if (!valido.ok) return valido
  const [novo] = await exec.insert(cargos)
    .values({ contaId: quem.contaId, nome: valido.nome, modulos: valido.modulos })
    .returning({ id: cargos.id })
  return { ok: true, id: novo.id }
}

export async function editarCargo(
  exec: Executor, quem: QuemGerenciaCargos, id: string, dados: DadosCargo, podeDar: string[],
): Promise<Resultado> {
  const [cargo] = await exec.select({ contaId: cargos.contaId }).from(cargos)
    .where(and(eq(cargos.id, id), daConta(quem))).limit(1)
  if (!cargo) return NAO_ENCONTRADO
  const valido = await validar(exec, cargo.contaId, dados, podeDar, id)
  if (!valido.ok) return valido
  await exec.update(cargos)
    .set({ nome: valido.nome, modulos: valido.modulos, atualizadoEm: new Date() })
    .where(and(eq(cargos.id, id), eq(cargos.contaId, cargo.contaId)))
  return { ok: true }
}

export async function apagarCargo(exec: Executor, quem: QuemGerenciaCargos, id: string): Promise<Resultado> {
  const [cargo] = await exec.select({ contaId: cargos.contaId }).from(cargos)
    .where(and(eq(cargos.id, id), daConta(quem))).limit(1)
  if (!cargo) return NAO_ENCONTRADO
  const [{ n }] = await exec.select({ n: count() }).from(usuarios).where(eq(usuarios.cargoId, id))
  if (n > 0) return { ok: false, erro: `Cargo em uso por ${n} ${n === 1 ? 'usuário' : 'usuários'}` }
  await exec.delete(cargos).where(and(eq(cargos.id, id), eq(cargos.contaId, cargo.contaId)))
  return { ok: true }
}

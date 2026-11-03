/**
 * Cargos da Conta (#449, #616, adendo ao ADR-0018): nome e papel base; quem tem o cargo faz o que
 * a base faz. Outra Conta não lê, não edita nem atribui; o admin_geral vê todas.
 */
import { and, asc, count, eq, ne, type SQL, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { cargos, grupos, lojas, usuarios } from '@/lib/db/schema'
import { PAPEIS_BASE_DO_CARGO, type PapelBase } from '@/lib/cargos-opcoes'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

/** `contaId` é a Conta do grupo ativo da sessão. */
export type QuemGerenciaCargos = { papel: string; contaId: string }

export type DadosCargo = { nome: string; papelBase: string }
type Resultado = { ok: true } | { ok: false; erro: string }

const NAO_ENCONTRADO = { ok: false, erro: 'Cargo não encontrado' } as const

// Nomes dos papéis fixos como aparecem na tela e como o Cesar fala, nos dois gêneros.
const NOMES_FIXOS = [
  'admin', 'administrador', 'administradora',
  'admin geral', 'admin socio', 'admin socia', 'socio', 'socia',
  'administrador geral', 'administradora geral', 'administrador socio', 'administradora socia',
  'aux adm', 'aux administrativo', 'aux administrativa', 'auxiliar administrativo', 'auxiliar administrativa',
  'vendedor', 'vendedora', 'mecanico', 'mecanica', 'motorista', 'cargo',
]

// Sem espaço nem pontuação: "AuxAdm", "Aux-Adm" e "Vendedor(a)" também são nomes fixos.
function chaveDeNomeFixo(nome: string): string {
  return nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\([ao]\)/g, '').replace(/[^a-z]/g, '')
}

const CHAVES_FIXAS = new Set(NOMES_FIXOS.map(chaveDeNomeFixo))

function daConta(quem: QuemGerenciaCargos): SQL | undefined {
  return quem.papel === 'admin_geral' ? undefined : eq(cargos.contaId, quem.contaId)
}

async function validar(
  exec: Executor, contaId: string, dados: DadosCargo, ignorarId?: string,
): Promise<{ ok: false; erro: string } | { ok: true; nome: string; papelBase: PapelBase }> {
  // NFC: o cargo_nome_chave() do banco não reconhece acento decomposto (texto colado do Mac).
  const nome = dados.nome.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!nome) return { ok: false, erro: 'Informe o nome do cargo' }
  if (CHAVES_FIXAS.has(chaveDeNomeFixo(nome))) return { ok: false, erro: 'Esse nome é de um cargo fixo do MOVA' }
  const papelBase = PAPEIS_BASE_DO_CARGO.find(p => p === dados.papelBase)
  if (!papelBase) return { ok: false, erro: 'Escolha o papel base do cargo' }
  const [repetido] = await exec.select({ id: cargos.id }).from(cargos)
    .where(and(
      eq(cargos.contaId, contaId),
      sql`cargo_nome_chave(${cargos.nome}) = cargo_nome_chave(${nome})`,
      ignorarId ? ne(cargos.id, ignorarId) : undefined,
    ))
    .limit(1)
  if (repetido) return { ok: false, erro: 'Já existe um cargo com esse nome' }
  return { ok: true, nome, papelBase }
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
  exec: Executor, quem: QuemGerenciaCargos, dados: DadosCargo,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const valido = await validar(exec, quem.contaId, dados)
  if (!valido.ok) return valido
  const [novo] = await exec.insert(cargos)
    .values({ contaId: quem.contaId, nome: valido.nome, papelBase: valido.papelBase })
    .returning({ id: cargos.id })
  return { ok: true, id: novo.id }
}

export async function editarCargo(
  exec: Executor, quem: QuemGerenciaCargos, id: string, dados: DadosCargo,
): Promise<Resultado> {
  const [cargo] = await exec.select({ contaId: cargos.contaId }).from(cargos)
    .where(and(eq(cargos.id, id), daConta(quem))).limit(1)
  if (!cargo) return NAO_ENCONTRADO
  const valido = await validar(exec, cargo.contaId, dados, id)
  if (!valido.ok) return valido
  await exec.update(cargos)
    .set({ nome: valido.nome, papelBase: valido.papelBase, atualizadoEm: new Date() })
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

/**
 * cargo_id a gravar no usuário. `contaId` é a Conta do usuário-alvo (da loja dele), não a
 * de quem edita. Cargo de outra Conta e id inexistente recebem a mesma frase.
 */
export async function cargoParaGravar(
  exec: Executor, alvo: { papel: string; contaId: string | null; cargoId: string | null },
): Promise<{ ok: true; cargoId: string | null } | { ok: false; erro: string }> {
  if (alvo.papel !== 'cargo') return { ok: true, cargoId: null }
  if (!alvo.cargoId || !alvo.contaId) return NAO_ENCONTRADO
  const cargo = await cargoDaConta(exec, alvo.contaId, alvo.cargoId)
  return cargo ? { ok: true, cargoId: cargo.id } : NAO_ENCONTRADO
}

/** Nome e papel base do cargo, só se o cargo for da Conta da loja do usuário. */
export async function cargoDoUsuario(
  exec: Executor, usuario: { papel: string; lojaId: string | null; cargoId: string | null },
): Promise<{ nome: string; papelBase: PapelBase } | null> {
  if (usuario.papel !== 'cargo' || !usuario.cargoId || !usuario.lojaId) return null
  const [linha] = await exec.select({ nome: cargos.nome, papelBase: cargos.papelBase }).from(cargos)
    .innerJoin(grupos, eq(grupos.contaId, cargos.contaId))
    .innerJoin(lojas, and(eq(lojas.grupoId, grupos.id), eq(lojas.id, usuario.lojaId)))
    .where(eq(cargos.id, usuario.cargoId))
    .limit(1)
  return linha ?? null
}

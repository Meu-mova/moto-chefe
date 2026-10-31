// ─── Liberar e revogar grupos para o admin_rede (#517, ADR-0019) ──────────────
// Só o admin_geral libera, e só grupo de outra Conta (o da própria Conta vai por
// grupos_acesso). Vale na hora: getUsuarioLogado relê as liberações a cada requisição.
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contas, grupos, gruposLiberados, usuarios } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

export type MudancaLiberacao = { liberados: string[]; revogados: string[] }

export type ResultadoLiberacao = { ok: true } & MudancaLiberacao | { ok: false; erro: string }

/** Grupos liberados (não revogados) do usuário: o modal de /admin/usuarios e a conferência ao gravar. */
export async function gruposLiberadosDoUsuario(usuarioId: string, exec: Pick<typeof db, 'select'> = db): Promise<string[]> {
  const linhas = await exec.select({ grupoId: gruposLiberados.grupoId }).from(gruposLiberados)
    .where(and(eq(gruposLiberados.usuarioId, usuarioId), isNull(gruposLiberados.revogadoEm)))
  return linhas.map(l => l.grupoId)
}

/**
 * Deixa vivas exatamente as liberações de `grupoIds`: cria as novas e revoga as que saíram.
 * Recusa quem não é admin_geral, alvo que não é admin_rede e grupo da Conta do próprio alvo.
 */
export async function sincronizarGruposLiberados(
  exec: Executor,
  gestor: { id: string; papel: string },
  alvoId: string,
  grupoIds: string[],
): Promise<ResultadoLiberacao> {
  if (gestor.papel !== 'admin_geral') return { ok: false, erro: 'Só o Admin Geral libera grupos de outras Contas' }
  const [alvo] = await exec.select({ papel: usuarios.papel, contaId: usuarios.contaId }).from(usuarios).where(eq(usuarios.id, alvoId)).limit(1)
  if (!alvo) return { ok: false, erro: 'Usuário não encontrado' }
  const pedidos = [...new Set(grupoIds)]
  if (pedidos.length && alvo.papel !== 'admin_rede') return { ok: false, erro: 'Só o Admin de Rede recebe grupos de outras Contas' }
  if (pedidos.length) {
    const validos = await exec.select({ id: grupos.id, contaId: grupos.contaId }).from(grupos).where(inArray(grupos.id, pedidos))
    if (validos.length !== pedidos.length) return { ok: false, erro: 'Grupo inválido' }
    if (validos.some(g => g.contaId === alvo.contaId)) return { ok: false, erro: 'Grupo da própria Conta: use os grupos de acesso' }
  }
  const vivos = await gruposLiberadosDoUsuario(alvoId, exec)
  const liberados = pedidos.filter(g => !vivos.includes(g))
  const revogados = vivos.filter(g => !pedidos.includes(g))
  if (liberados.length) {
    await exec.insert(gruposLiberados).values(liberados.map(grupoId => ({ usuarioId: alvoId, grupoId, liberadoPor: gestor.id })))
  }
  if (revogados.length) {
    await exec.update(gruposLiberados).set({ revogadoEm: sql`now()` as unknown as Date })
      .where(and(eq(gruposLiberados.usuarioId, alvoId), inArray(gruposLiberados.grupoId, revogados), isNull(gruposLiberados.revogadoEm)))
    // A aprovação no grupo de fora cai junto: não sobra permissão de uma liberação revogada.
    await exec.update(usuarios)
      .set({ gruposAprovacao: sql`array(select g from unnest(${usuarios.gruposAprovacao}) g where not (g = any(${sql.param(revogados)}::uuid[])))` as unknown as string[] })
      .where(eq(usuarios.id, alvoId))
  }
  return { ok: true, liberados, revogados }
}

/**
 * Grupos de aprovação fora do alcance do usuário: de outra Conta e, para o admin_rede, também
 * não liberados para ele. Vazio = pode gravar. Os da própria Conta sempre valem. Para gravar
 * basta a liberação não revogada: grupo inativo ou bloqueado por mensalidade barra no uso
 * (a persona some), não no cadastro, senão nenhuma edição do admin_rede passaria até pagar.
 */
export async function aprovacoesForaDoAlcance(
  exec: Pick<typeof db, 'select'>,
  alvo: { id: string | null; papel: string; contaId: string | null },
  gruposAprovacao: string[],
): Promise<string[]> {
  if (alvo.papel === 'admin_geral' || !gruposAprovacao.length) return []
  const linhas = await exec.select({ id: grupos.id, contaId: grupos.contaId }).from(grupos).where(inArray(grupos.id, gruposAprovacao))
  const deFora = gruposAprovacao.filter(id => linhas.find(l => l.id === id)?.contaId !== alvo.contaId)
  if (!deFora.length || alvo.papel !== 'admin_rede' || !alvo.id) return deFora
  const liberados = (await gruposLiberadosDoUsuario(alvo.id, exec))
  return deFora.filter(id => !liberados.includes(id))
}

export type AcessoDeFora = { usuarioNome: string; contaOrigem: string | null; grupoNome: string; liberadoEm: Date }

/** Quem de fora tem acesso aos grupos da Conta: a Conta dona vê, mas não revoga. */
export async function acessosDeFora(contaId: string, exec: Pick<typeof db, 'select'> = db): Promise<AcessoDeFora[]> {
  return exec.select({
    usuarioNome: usuarios.nome,
    contaOrigem: contas.nome,
    grupoNome: grupos.nome,
    liberadoEm: gruposLiberados.liberadoEm,
  })
    .from(gruposLiberados)
    .innerJoin(grupos, eq(grupos.id, gruposLiberados.grupoId))
    .innerJoin(usuarios, eq(usuarios.id, gruposLiberados.usuarioId))
    .leftJoin(contas, eq(contas.id, usuarios.contaId))
    .where(and(eq(grupos.contaId, contaId), isNull(gruposLiberados.revogadoEm)))
    .orderBy(asc(grupos.nome), asc(usuarios.nome))
}

/** Grupos ativos de todas as Contas, com a Conta dona: o que o admin_geral pode liberar. */
export async function gruposLiberaveis(exec: Pick<typeof db, 'select'> = db) {
  return exec.select({ id: grupos.id, nome: grupos.nome, contaId: grupos.contaId, contaNome: contas.nome })
    .from(grupos).innerJoin(contas, eq(contas.id, grupos.contaId))
    .where(eq(grupos.ativo, true)).orderBy(asc(contas.nome), asc(grupos.nome))
}

/** Liberações vivas de todos os usuários, por usuário (só para a tela do admin_geral). */
export async function liberacoesPorUsuario(exec: Pick<typeof db, 'select'> = db): Promise<Record<string, string[]>> {
  const linhas = await exec.select({ usuarioId: gruposLiberados.usuarioId, grupoId: gruposLiberados.grupoId })
    .from(gruposLiberados).where(isNull(gruposLiberados.revogadoEm))
  const porUsuario: Record<string, string[]> = {}
  for (const l of linhas) (porUsuario[l.usuarioId] ??= []).push(l.grupoId)
  return porUsuario
}

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { grupos, lojas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export type Grupo = typeof grupos.$inferSelect

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

export async function getGrupoAtivo(usuario: { papel: string; lojaId: string | null }): Promise<Grupo> {
  if (ADMIN_PAPEIS.includes(usuario.papel)) {
    const cookieStore = await cookies()
    const grupoIdCookie = cookieStore.get('grupoAtivo')?.value

    if (grupoIdCookie) {
      const [grupo] = await db
        .select()
        .from(grupos)
        .where(and(eq(grupos.id, grupoIdCookie), eq(grupos.ativo, true)))
        .limit(1)
      if (grupo) return grupo
    }

    const [primeiro] = await db
      .select()
      .from(grupos)
      .where(eq(grupos.ativo, true))
      .orderBy(grupos.nome)
      .limit(1)
    if (!primeiro) throw new Error('Nenhum grupo ativo cadastrado')
    return primeiro
  }

  if (!usuario.lojaId) throw new Error('Usuário sem loja associada')

  const [loja] = await db
    .select({ grupoId: lojas.grupoId })
    .from(lojas)
    .where(eq(lojas.id, usuario.lojaId))
    .limit(1)
  if (!loja) throw new Error('Loja do usuário não encontrada')

  const [grupo] = await db.select().from(grupos).where(eq(grupos.id, loja.grupoId)).limit(1)
  if (!grupo) throw new Error('Grupo da loja não encontrado')
  return grupo
}

export async function listarGruposAtivos(): Promise<Grupo[]> {
  return db.select().from(grupos).where(eq(grupos.ativo, true)).orderBy(grupos.nome)
}

export async function listarLojasDoGrupoAtivo(
  usuario: { papel: string; lojaId: string | null },
  opts?: { somenteAtivas?: boolean },
): Promise<{ id: string; nome: string }[]> {
  const grupo = await getGrupoAtivo(usuario)
  const somenteAtivas = opts?.somenteAtivas ?? true
  return db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .where(somenteAtivas ? and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true)) : eq(lojas.grupoId, grupo.id))
    .orderBy(lojas.nome)
}

export async function listarLojaIdsDoGrupoAtivo(usuario: { papel: string; lojaId: string | null }): Promise<string[]> {
  const grupo = await getGrupoAtivo(usuario)
  const rows = await db.select({ id: lojas.id }).from(lojas).where(eq(lojas.grupoId, grupo.id))
  return rows.map(r => r.id)
}

// ─── Exceção pontual: transferência entre grupos ──────────────────────────────
// Liberado apenas para este usuário, por decisão explícita — não é uma role
// genérica. Ver docs/superpowers/specs/2026-07-01-transferencia-entre-grupos-design.md
const EMAIL_ACESSO_MULTI_GRUPO = 'cesar.rodrigues@motochefesuldeminas.com.br'

export function podeTransferirEntreGrupos(usuario: { email: string }): boolean {
  return usuario.email === EMAIL_ACESSO_MULTI_GRUPO
}

export async function listarTodasLojasAtivas(): Promise<{ id: string; nome: string }[]> {
  return db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .where(eq(lojas.ativa, true))
    .orderBy(lojas.nome)
}

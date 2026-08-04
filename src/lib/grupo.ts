import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { grupos, lojas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  EMAIL_ACESSO_MULTI_GRUPO,
  aprovaBaixoValorEmQualquerGrupo,
  socioAprovaNoGrupo,
} from '@/lib/aprovacao-permissao'

export type Grupo = typeof grupos.$inferSelect

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

// Grupo legado, criado na migração multi-grupo (0011) a partir dos dados que já existiam.
// Usado como padrão de fallback para não cair num grupo novo sem dados por ordem alfabética.
const GRUPO_PADRAO_ID = '00000000-0000-4000-8000-000000000001'

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

    const candidatos = await db
      .select()
      .from(grupos)
      .where(eq(grupos.ativo, true))
      .orderBy(grupos.nome)
    if (!candidatos.length) throw new Error('Nenhum grupo ativo cadastrado')
    return candidatos.find(g => g.id === GRUPO_PADRAO_ID) ?? candidatos[0]
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

export async function getGrupoIdDaLoja(lojaId: string): Promise<string> {
  const [loja] = await db.select({ grupoId: lojas.grupoId }).from(lojas).where(eq(lojas.id, lojaId)).limit(1)
  if (!loja) throw new Error('Loja não encontrada')
  return loja.grupoId
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
export function podeTransferirEntreGrupos(usuario: { email: string }): boolean {
  return usuario.email === EMAIL_ACESSO_MULTI_GRUPO
}

// ─── Aprovação de pagamento sensível (financiamento/transferência) ────────────
// Mesma exceção pontual de podeTransferirEntreGrupos — só o Cesar aprova,
// mesmo admin_socio (que aprova venda de baixo valor) fica de fora aqui,
// por decisão dele: os demais admins não têm acesso a essas informações.
export function podeAprovarPagamentoSensivel(usuario: { email: string }): boolean {
  return usuario.email === EMAIL_ACESSO_MULTI_GRUPO
}

export async function listarTodasLojasAtivas(): Promise<{ id: string; nome: string }[]> {
  return db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .where(eq(lojas.ativa, true))
    .orderBy(lojas.nome)
}

// ─── Aprovação de venda abaixo do valor mínimo ────────────────────────────────
// admin_geral e o usuário multi-grupo aprovam de qualquer grupo; admin_socio
// comum só do próprio grupo, determinado pela loja fixa dele (usuarios.lojaId),
// não pelo cookie grupoAtivo — a permissão de aprovar não deve depender de qual
// grupo o sócio está "olhando" no momento. A regra pura fica em
// @/lib/aprovacao-permissao (testável sem banco).
export async function podeAprovarVendaBaixoValor(
  usuario: { papel: string; email: string; lojaId: string | null },
  lojaIdVenda: string,
): Promise<boolean> {
  // admin_geral e o usuário multi-grupo aprovam em qualquer grupo — sem isto o
  // sócio multi-grupo ficava travado no BH por ter loja fixa no Sul de Minas.
  if (aprovaBaixoValorEmQualquerGrupo(usuario)) return true
  if (usuario.papel !== 'admin_socio' || !usuario.lojaId) return false

  const [grupoVenda, grupoSocio] = await Promise.all([
    getGrupoIdDaLoja(lojaIdVenda),
    getGrupoIdDaLoja(usuario.lojaId),
  ])
  return socioAprovaNoGrupo(usuario, grupoVenda, grupoSocio)
}

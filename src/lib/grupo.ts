import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { grupos, lojas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

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

// ─── Exceção pontual: reserva/venda no Galpão Matriz por qualquer vendedor ────
// Galpão Matriz é o estoque central de chegada do Sul de Minas — motos passam
// por lá antes de serem distribuídas pras lojas. Vendedor normalmente só age
// (reservar/vender) sobre moto da própria loja; aqui abrimos exceção só pra essa
// loja, só pro papel vendedor, e só pra reserva/venda — garantia, montagem e
// transferência continuam exigindo lotação na loja da moto.
const LOJA_GALPAO_MATRIZ_ID = 'f154c1a5-c5ed-4bdc-af14-b1dea024beae'

export function podeVendedorReservarForaDaLoja(lojaIdMoto: string): boolean {
  return lojaIdMoto === LOJA_GALPAO_MATRIZ_ID
}

// ─── Aprovação de venda abaixo do valor mínimo ────────────────────────────────
// admin_geral aprova de qualquer grupo; admin_socio só do próprio grupo,
// determinado pela loja fixa dele (usuarios.lojaId), não pelo cookie
// grupoAtivo — a permissão de aprovar não deve depender de qual grupo o
// sócio está "olhando" no momento.
export async function podeAprovarVendaBaixoValor(
  usuario: { papel: string; lojaId: string | null },
  lojaIdVenda: string,
): Promise<boolean> {
  if (usuario.papel === 'admin_geral') return true
  if (usuario.papel !== 'admin_socio' || !usuario.lojaId) return false

  const [grupoVenda, grupoSocio] = await Promise.all([
    getGrupoIdDaLoja(lojaIdVenda),
    getGrupoIdDaLoja(usuario.lojaId),
  ])
  return grupoVenda === grupoSocio
}

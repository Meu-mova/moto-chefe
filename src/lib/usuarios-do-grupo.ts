import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { lojas, usuarios } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select'>

// "Do grupo" = loja do usuário no grupo ou grupo no grupos_acesso, dentro da Conta do
// grupo: a mesma posse do seletor (podeVerGrupo). admin_geral sem loja fica de fora de propósito: lista global
// mostrava usuários de outros clientes do MOVA.
export async function listarUsuariosDoGrupo(
  grupoId: string,
  filtro: { papel?: 'mecanico' | 'vendedor' } = {},
  exec: Executor = db,
): Promise<{ id: string; nome: string }[]> {
  const doGrupo = and(
    or(eq(lojas.grupoId, grupoId), sql`${grupoId}::uuid = any(${usuarios.gruposAcesso})`),
    // Marcação de grupo de outra Conta não vale (ADR-0018, adendo de 21/10).
    sql`${usuarios.contaId} = (select conta_id from grupos where id = ${grupoId}::uuid)`,
  )
  const doPapel = filtro.papel === 'mecanico'
    ? eq(usuarios.papel, 'mecanico')
    : filtro.papel === 'vendedor'
      // Inclui quem vende sem ter 'vendedor' como papel principal; senão o filtro do
      // dashboard esconde as vendas dessas pessoas.
      ? or(eq(usuarios.papel, 'vendedor'), sql`'vendedor' = any(${usuarios.papeisExtras})`)
      : undefined
  return exec
    .select({ id: usuarios.id, nome: usuarios.nome })
    .from(usuarios)
    .leftJoin(lojas, eq(lojas.id, usuarios.lojaId))
    .where(and(doGrupo, doPapel))
    .orderBy(usuarios.nome)
}

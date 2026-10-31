/**
 * Venda de peças que o usuário pode editar (#242) ou corrigir o cliente (#397). A Conta e as
 * lojas entram no where: venda de outra Conta volta vazia, igual a venda inexistente.
 * Regra: admin_geral, qualquer uma; admin_socio, grupo ativo da própria Conta que ele vê
 * (o da própria loja ou os de grupos_acesso, como em podeVerGrupo); os demais, só a própria loja.
 */
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { grupos, lojas, vendasPecas } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select'>

export type UsuarioDaVenda = { papel: string; lojaId: string | null; gruposAcesso?: readonly string[] | null; contaId: string | null; grupoLiberado?: string | null }

function vendaVisivel(usuario: UsuarioDaVenda): SQL {
  if (usuario.papel === 'admin_geral') return sql`true`
  if (usuario.papel !== 'admin_socio') return usuario.lojaId ? eq(vendasPecas.lojaId, usuario.lojaId) : sql`false`
  if (!usuario.contaId) return sql`false`
  const daPropriaLoja = usuario.lojaId
    ? sql`${lojas.grupoId} = (select l.grupo_id from lojas l where l.id = ${usuario.lojaId})`
    : sql`false`
  const acesso = usuario.gruposAcesso?.length ? inArray(grupos.id, [...usuario.gruposAcesso]) : sql`false`
  return and(eq(grupos.contaId, usuario.contaId), eq(grupos.ativo, true), or(daPropriaLoja, acesso))!
}

/** `travar` pega a linha da venda com `for update` (só dentro de transação). */
export async function vendaPecaEditavel(exec: Executor, usuario: UsuarioDaVenda, vendaId: string, travar = false) {
  const q = exec.select({
    id: vendasPecas.id,
    numero: vendasPecas.numero,
    lojaId: vendasPecas.lojaId,
    dataVenda: vendasPecas.dataVenda,
    grupoId: lojas.grupoId,
    clienteNome: vendasPecas.clienteNome,
    clienteDocumento: vendasPecas.clienteDocumento,
    clienteTipoPessoa: vendasPecas.clienteTipoPessoa,
  }).from(vendasPecas)
    .innerJoin(lojas, eq(lojas.id, vendasPecas.lojaId))
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(and(eq(vendasPecas.id, vendaId), vendaVisivel(usuario)))
    .$dynamic()
  const [venda] = await (travar ? q.for('update', { of: vendasPecas }) : q.limit(1))
  return venda ?? null
}

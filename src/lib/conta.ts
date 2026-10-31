import { and, asc, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agendamentos, clientes, grupos, lojas, ordensServico, vendas, vendasPecas } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select'>

// Conta (ADR-0018): o que vale "entre grupos" (exceção nominal do Cesar, grupos de
// aprovação, lista de todas as lojas) vale só dentro da Conta do usuário.
// Sem next/headers, para ser testado contra o banco.

export async function grupoEstaNaConta(grupoId: string, contaId: string | null, exec: Executor = db): Promise<boolean> {
  if (!contaId) return false
  const [g] = await exec.select({ contaId: grupos.contaId }).from(grupos).where(eq(grupos.id, grupoId)).limit(1)
  return g?.contaId === contaId
}

// admin_geral (da plataforma, sem Conta) vê as lojas ativas de todas as Contas.
export async function listarLojasAtivasDaConta(
  usuario: { papel: string; contaId: string | null },
  exec: Executor = db,
): Promise<{ id: string; nome: string }[]> {
  const consulta = exec
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
  if (usuario.papel === 'admin_geral') return consulta.where(eq(lojas.ativa, true)).orderBy(asc(lojas.nome))
  if (!usuario.contaId) return []
  return consulta.where(and(eq(lojas.ativa, true), eq(grupos.contaId, usuario.contaId))).orderBy(asc(lojas.nome))
}

// Lojas da Conta como subconsulta, para filtrar registros com inArray(x.lojaId, ...).
export function lojasDaConta(contaId: string) {
  return db.select({ id: lojas.id }).from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId)).where(eq(grupos.contaId, contaId))
}

// Escopo de lojas de quem consulta: as da Conta, ou só as do grupo liberado na persona do
// admin_rede (#517), que nunca vê outro grupo da Conta dona.
export type EscopoDoUsuario = { contaId: string | null; grupoLiberado?: string | null }

export function lojasDoEscopo(usuario: EscopoDoUsuario) {
  if (usuario.grupoLiberado) return db.select({ id: lojas.id }).from(lojas).where(eq(lojas.grupoId, usuario.grupoLiberado))
  if (!usuario.contaId) return db.select({ id: lojas.id }).from(lojas).where(sql`false`)
  return lojasDaConta(usuario.contaId)
}

// O grupo está no escopo de quem consulta: o da persona, ou qualquer um da Conta.
export async function grupoNoEscopo(grupoId: string, usuario: EscopoDoUsuario, exec: Executor = db): Promise<boolean> {
  if (usuario.grupoLiberado) return grupoId === usuario.grupoLiberado
  return grupoEstaNaConta(grupoId, usuario.contaId, exec)
}

// Clientes que quem consulta ou grava vê: os da Conta. Na persona do admin_rede (#517), só os
// que têm venda, venda de peças, OS ou agendamento nas lojas do grupo liberado (decisão do Luis).
export function clientesDoEscopo(contaId: string, usuario: EscopoDoUsuario): SQL {
  const daConta = eq(clientes.contaId, contaId)
  if (!usuario.grupoLiberado) return daConta
  const doGrupo = lojasDoEscopo(usuario)
  const movimentou = [vendas, vendasPecas, ordensServico, agendamentos].map(t =>
    inArray(clientes.id, db.select({ id: t.clienteId }).from(t).where(and(isNotNull(t.clienteId), inArray(t.lojaId, doGrupo)))))
  return and(daConta, or(...movimentou))!
}

// Conta da loja de um registro (venda, OS): é a dona do cliente que ele cria ou atualiza.
export async function contaDaLoja(lojaId: string, exec: Executor = db): Promise<string> {
  const [r] = await exec
    .select({ contaId: grupos.contaId })
    .from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(eq(lojas.id, lojaId))
    .limit(1)
  if (!r) throw new Error('Loja não encontrada')
  return r.contaId
}

// "Cód. Bling" e "Apelidos na NF" só para a Conta que usa Bling (#476, adendo ao ADR-0018):
// algum grupo da Conta tem as duas credenciais que src/lib/bling.ts exige (vazio não conta). Dado do banco,
// nunca nome ou CNPJ. Recebe o grupo (ativo) e olha só os grupos da mesma Conta.
export async function contaDoGrupoUsaBling(grupoId: string, exec: Executor = db): Promise<boolean> {
  const daConta = exec.select({ contaId: grupos.contaId }).from(grupos).where(eq(grupos.id, grupoId))
  const [comBling] = await exec.select({ id: grupos.id }).from(grupos)
    .where(and(inArray(grupos.contaId, daConta), sql`coalesce(${grupos.blingClientId}, '') <> ''`, sql`coalesce(${grupos.blingClientSecret}, '') <> ''`))
    .limit(1)
  return !!comBling
}

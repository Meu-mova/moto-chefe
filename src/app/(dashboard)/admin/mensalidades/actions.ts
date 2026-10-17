'use server'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db, execRows } from '@/lib/db'
import { grupos, mensalidadeConfig, mensalidades } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { hojeBrt } from '@/lib/data-venda'
import { buscarPagamentos } from '@/lib/mercadopago/cliente'
import { decidirBaixa } from '@/lib/mercadopago/webhook'
import { estaBloqueado } from '@/lib/mensalidade/regras'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function listarMensalidadesAction() {
  await assertAdmin()
  const hoje = hojeBrt()
  const gruposLinhas = await execRows(sql`
    select g.id, g.nome, coalesce(c.isento, false) as isento, g.primeiro_acesso_em::text as primeiro_acesso_em,
           coalesce(c.valor_mensal, a.valor_mensal)::text as valor_mensal
    from grupos g
    left join mensalidade_config c on c.grupo_id = g.id
    left join adesoes_mova a on a.grupo_id = g.id
    where g.ativo
    order by g.nome
  `) as { id: string; nome: string; isento: boolean; primeiro_acesso_em: string | null; valor_mensal: string | null }[]
  const abertas = await db.select({
    id: mensalidades.id, grupoId: mensalidades.grupoId, competencia: mensalidades.competencia,
    valor: mensalidades.valor, acrescimo: mensalidades.acrescimo, vencimento: mensalidades.vencimento,
    temLink: sql<boolean>`${mensalidades.linkPagamento} is not null`,
  }).from(mensalidades).where(eq(mensalidades.status, 'aberta')).orderBy(mensalidades.vencimento)

  return gruposLinhas.map(g => {
    const doGrupo = abertas.filter(m => m.grupoId === g.id)
    return { ...g, abertas: doGrupo, bloqueado: !g.isento && estaBloqueado(doGrupo.map(m => m.vencimento), hoje) }
  })
}

export type GrupoMensalidade = Awaited<ReturnType<typeof listarMensalidadesAction>>[number]

export async function marcarIsentoAction(grupoId: string, isento: boolean): Promise<{ ok: true } | { ok: false; erro: string }> {
  await assertAdmin()
  const [g] = await db.select({ id: grupos.id }).from(grupos).where(eq(grupos.id, grupoId))
  if (!g) return { ok: false, erro: 'Grupo não encontrado' }
  await db.insert(mensalidadeConfig).values({ grupoId, isento })
    .onConflictDoUpdate({ target: mensalidadeConfig.grupoId, set: { isento } })
  revalidatePath('/admin/mensalidades')
  return { ok: true }
}

/**
 * Procura no Mercado Pago um pagamento aprovado desta mensalidade e dá baixa. É a
 * saída quando o cliente diz que pagou e o webhook não chegou (spec, seção 8).
 */
export async function conferirPagamentoAction(mensalidadeId: string): Promise<{ ok: true; paga: boolean; motivo: string } | { ok: false; erro: string }> {
  await assertAdmin()
  const [m] = await db.select().from(mensalidades).where(eq(mensalidades.id, mensalidadeId))
  if (!m) return { ok: false, erro: 'Mensalidade não encontrada' }
  if (m.status === 'paga') return { ok: true, paga: true, motivo: 'Já estava paga' }

  let pagamentos
  try {
    pagamentos = await buscarPagamentos(m.id)
  } catch {
    return { ok: false, erro: 'Não deu para consultar o Mercado Pago agora' }
  }
  const devido = { status: m.status, valorDevido: Number(m.valor) + Number(m.acrescimo) }
  const aprovado = pagamentos.find(p => decidirBaixa(p, devido).acao === 'pagar')
  // A busca do Mercado Pago pode não listar pendentes e recusados (visto no sandbox
  // em 17/10/2026): a resposta fala só do que importa, o aprovado.
  if (!aprovado) return { ok: true, paga: false, motivo: 'Nenhum pagamento aprovado encontrado no Mercado Pago' }
  await db.update(mensalidades)
    .set({ status: 'paga', pagoEm: new Date(), mpPaymentId: String(aprovado.id) })
    .where(and(eq(mensalidades.id, m.id), eq(mensalidades.status, 'aberta'), isNull(mensalidades.pagoEm)))
  revalidatePath('/admin/mensalidades')
  return { ok: true, paga: true, motivo: 'Pagamento aprovado encontrado; baixa feita' }
}

/**
 * Casamento de uma transação de cartão com a venda do sistema (moto, peça ou OS), sempre
 * restrito às lojas passadas. Um lugar só para a rota das operadoras e para o CSV/relatório.
 * A ordem é fixa: moto, depois peça, depois OS.
 */
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { and, between, eq, inArray, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { lojas, ordensServico, vendas, vendasPecas } from '@/lib/db/schema'
import { TIPOS_CARTAO } from '@/lib/conciliacao-status'

type Db = Pick<typeof db, 'select'>

export type Alvos = { vendaId: string | null; pecaVendaId: string | null; osId: string | null }

const TOLERANCIA = 0.05 // R$ 0,05 de tolerância no valor

type Pagamento = { tipo: string; valor: number; parcelas?: number }

const semAlvos = (): Alvos => ({ vendaId: null, pecaVendaId: null, osId: null })

/** Um lançamento de cartão do mesmo valor (±R$ 0,05) e mesmas parcelas. */
function casaPagamento(pagamentos: unknown, valorBruto: number, parcelas: number): boolean {
  const pgtos = (pagamentos ?? []) as Pagamento[]
  return pgtos.some(p =>
    TIPOS_CARTAO.has(p.tipo) &&
    Math.abs(p.valor - valorBruto) <= TOLERANCIA &&
    (!p.parcelas || p.parcelas === parcelas)
  )
}

export async function lojaIdsDoGrupo(db: Db, grupoId: string): Promise<string[]> {
  const rows = await db.select({ id: lojas.id }).from(lojas).where(eq(lojas.grupoId, grupoId))
  return rows.map(l => l.id)
}

/** Pela autorização registrada no pagamento da venda: `pagamentos @> [{autorizacao}]`. */
export async function casarPorAutorizacao(db: Db, lojaIds: string[], autorizacao: string): Promise<Alvos> {
  const alvos = semAlvos()
  if (lojaIds.length === 0) return alvos
  const contem = (pagamentos: AnyPgColumn) =>
    sql`${pagamentos} @> ${JSON.stringify([{ autorizacao }])}::jsonb`

  const [venda] = await db.select({ id: vendas.id }).from(vendas)
    .where(and(contem(vendas.pagamentos), inArray(vendas.lojaId, lojaIds)))
    .limit(1)
  if (venda) return { ...alvos, vendaId: venda.id }

  const [peca] = await db.select({ id: vendasPecas.id }).from(vendasPecas)
    .where(and(contem(vendasPecas.pagamentos), inArray(vendasPecas.lojaId, lojaIds)))
    .limit(1)
  if (peca) return { ...alvos, pecaVendaId: peca.id }

  const [os] = await db.select({ id: ordensServico.id }).from(ordensServico)
    .where(and(contem(ordensServico.pagamentos), inArray(ordensServico.lojaId, lojaIds)))
    .limit(1)
  if (os) return { ...alvos, osId: os.id }
  return alvos
}

/** Pelo valor: mesmo dia ± 1 dia, valor bruto ±R$ 0,05, mesma qtd de parcelas, em pagamento de cartão. */
export async function casarPorValor(
  db: Db,
  lojaIds: string[],
  t: { dataTransacao: string; valorBruto: number; parcelas: number },
): Promise<Alvos> {
  const alvos = semAlvos()
  if (lojaIds.length === 0) return alvos

  const dataBase = new Date(t.dataTransacao + 'T12:00:00Z')
  const dataMin = new Date(dataBase); dataMin.setDate(dataMin.getDate() - 1)
  const dataMax = new Date(dataBase); dataMax.setDate(dataMax.getDate() + 1)
  const casa = (v: { pagamentos: unknown }) => casaPagamento(v.pagamentos, t.valorBruto, t.parcelas)

  const vendasCandidatas = await db
    .select({ id: vendas.id, pagamentos: vendas.pagamentos })
    .from(vendas)
    .where(and(between(vendas.dataVenda, dataMin, dataMax), inArray(vendas.lojaId, lojaIds)))
  const vendaId = vendasCandidatas.find(casa)?.id
  if (vendaId) return { ...alvos, vendaId }

  const pecasCandidatas = await db
    .select({ id: vendasPecas.id, pagamentos: vendasPecas.pagamentos })
    .from(vendasPecas)
    .where(and(between(vendasPecas.dataVenda, dataMin, dataMax), inArray(vendasPecas.lojaId, lojaIds)))
  const pecaVendaId = pecasCandidatas.find(casa)?.id
  if (pecaVendaId) return { ...alvos, pecaVendaId }

  const osCandidatas = await db
    .select({ id: ordensServico.id, pagamentos: ordensServico.pagamentos })
    .from(ordensServico)
    .where(and(between(ordensServico.dataConclusao, dataMin, dataMax), inArray(ordensServico.lojaId, lojaIds)))
  const osId = osCandidatas.find(casa)?.id
  if (osId) return { ...alvos, osId }
  return alvos
}

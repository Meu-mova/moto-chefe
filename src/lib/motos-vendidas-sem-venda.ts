import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, historicoEstoque, lojas, modelos, motos, vendas } from '@/lib/db/schema'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'

type Exec = Pick<typeof db, 'select' | 'update' | 'insert'>

// O Editar moto (sócio e admin) grava disponibilidade 'vendida' sem criar venda, e a moto
// some do Showroom, das Vendas e do Dashboard (#544). Venda cancelada apaga a linha, então
// "sem venda" é não existir linha em vendas.
const semVenda = () => sql`not exists (select 1 from vendas v where v.moto_id = ${sql.raw('"motos"."id"')})`
const marcadaVendida = () => eq(motos.disponibilidade, 'vendida')
const daConta = (contaId: string) =>
  inArray(motos.lojaId, db.select({ id: lojas.id }).from(lojas).innerJoin(grupos, eq(grupos.id, lojas.grupoId)).where(eq(grupos.contaId, contaId)))

export type MotoVendidaSemVenda = { id: string; chassi: string; modelo: string; cor: string; lojaNome: string }

export async function listarMotosVendidasSemVenda(contaId: string, lojaIds: string[], exec: Exec = db): Promise<MotoVendidaSemVenda[]> {
  if (lojaIds.length === 0) return []
  return exec
    .select({ id: motos.id, chassi: motos.chassi, modelo: nomeDoModeloNaLoja(motos.lojaId), cor: motos.cor, lojaNome: lojas.nome })
    .from(motos)
    .innerJoin(modelos, eq(modelos.id, motos.modeloId))
    .innerJoin(lojas, eq(lojas.id, motos.lojaId))
    .where(and(marcadaVendida(), semVenda(), inArray(motos.lojaId, lojaIds), daConta(contaId)))
    .orderBy(lojas.nome, motos.chassi)
}

/** Id da moto com este chassi exato nas lojas da Conta, se ela está marcada como vendida sem venda. */
export async function motoVendidaSemVendaPorChassi(contaId: string, lojaIds: string[], chassi: string, exec: Exec = db): Promise<string | null> {
  const termo = chassi.trim().toUpperCase()
  if (!termo || lojaIds.length === 0) return null
  const [m] = await exec.select({ id: motos.id }).from(motos)
    .where(and(eq(sql`upper(${motos.chassi})`, termo), marcadaVendida(), semVenda(), inArray(motos.lojaId, lojaIds), daConta(contaId)))
    .limit(1)
  return m?.id ?? null
}

/**
 * Devolve ao estoque a moto marcada como vendida sem venda. Só a disponibilidade volta;
 * o status 'vendida' vira 'montada' (status 'caixa' e os demais ficam como estão).
 * Devolve false se a moto não é da Conta, não existe, tem venda ou não está vendida.
 */
export async function voltarMotoAoEstoque(contaId: string, motoId: string, usuarioId: string, exec: Exec = db): Promise<boolean> {
  const [moto] = await exec.select({ status: motos.status }).from(motos)
    .where(and(eq(motos.id, motoId), marcadaVendida(), semVenda(), daConta(contaId)))
    .limit(1)
  if (!moto) return false
  const statusNovo = moto.status === 'vendida' ? 'montada' as const : null
  // As mesmas condições no update: se uma venda entrou ou o status mudou depois do select,
  // nada volta e a tela recebe a recusa, sem histórico.
  const voltou = await exec.update(motos)
    .set({ disponibilidade: 'disponivel', ...(statusNovo ? { status: statusNovo } : {}) })
    .where(and(eq(motos.id, motoId), eq(motos.status, moto.status), marcadaVendida(), semVenda(), daConta(contaId)))
    .returning({ id: motos.id })
  if (voltou.length === 0) return false
  await exec.insert(historicoEstoque).values({
    motoId,
    usuarioId,
    tipo: 'mudanca_status',
    statusAnterior: statusNovo ? moto.status : null,
    statusNovo,
    observacao: 'Voltou ao estoque: estava marcada como vendida sem venda registrada',
  })
  return true
}

/** Se a moto tem venda de pé. Quem chama já conferiu o acesso à moto. */
export async function motoTemVenda(motoId: string, exec: Exec = db): Promise<boolean> {
  const [v] = await exec.select({ id: vendas.id }).from(vendas).where(eq(vendas.motoId, motoId)).limit(1)
  return !!v
}

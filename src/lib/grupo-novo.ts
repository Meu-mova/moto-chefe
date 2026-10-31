// ─── Grupo novo na Conta certa (#199, adendo de 2026-10-31 ao ADR-0018) ────────
// O admin_geral escolhe "Conta nova" (padrão) ou uma Conta existente; na existente,
// o grupo nasce nela, sem criar Conta nem marcas.
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contaMarcas, contas, grupos } from '@/lib/db/schema'
import { MARCAS_DA_CONTA_NOVA } from '@/lib/modelos-da-conta'
import { preencherGruposComPrecoPadrao } from '@/lib/tabela-preco-padrao'

type Escritor = Parameters<Parameters<typeof db.transaction>[0]>[0]
type DadosGrupo = Omit<typeof grupos.$inferInsert, 'id' | 'contaId'>

/** `contaId` null = Conta nova com o nome do grupo. */
export async function criarGrupo(tx: Escritor, dados: DadosGrupo, contaId: string | null): Promise<{ grupoId: string; contaId: string }> {
  let conta = contaId
  if (conta) {
    // Id que nem é UUID daria erro do Postgres; a resposta é a mesma de Conta inexistente.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conta)) throw new Error('Conta não encontrada')
    // Conta desativada (perdeu o grupo para outra, #554) não recebe grupo: mesma resposta de inexistente.
    const [existe] = await tx.select({ id: contas.id }).from(contas).where(and(eq(contas.id, conta), isNull(contas.desativadaEm))).limit(1)
    if (!existe) throw new Error('Conta não encontrada')
  } else {
    const [nova] = await tx.insert(contas).values({ nome: dados.nome }).returning({ id: contas.id })
    await tx.insert(contaMarcas).values(MARCAS_DA_CONTA_NOVA.map(marca => ({ contaId: nova.id, marca })))
    conta = nova.id
  }
  const [grupo] = await tx.insert(grupos).values({ ...dados, contaId: conta }).returning({ id: grupos.id })
  // Grupo novo já nasce com o preço sugerido da MotoChefe nos modelos da Conta (#522).
  await preencherGruposComPrecoPadrao([grupo.id], tx)
  return { grupoId: grupo.id, contaId: conta }
}

/** Contas ativas para o campo "Conta" do novo grupo (a desativada perdeu o grupo para outra, #554). */
export async function contasParaNovoGrupo(exec: Pick<typeof db, 'select'> = db) {
  return exec.select({
    id: contas.id,
    nome: contas.nome,
    grupos: sql<string[]>`coalesce(array_agg(${grupos.nome} order by ${grupos.nome}) filter (where ${grupos.id} is not null), '{}')`,
  }).from(contas).leftJoin(grupos, eq(grupos.contaId, contas.id)).where(isNull(contas.desativadaEm))
    .groupBy(contas.id).orderBy(asc(contas.nome))
}

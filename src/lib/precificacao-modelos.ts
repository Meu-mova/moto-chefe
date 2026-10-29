import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'

type Executor = Pick<typeof db, 'select'>

// O preço casa com o modelo pelo nome original em caixa alta (ver custoMotoExpr).
export const chaveNome = (s: string) => s.trim().toUpperCase()

/**
 * Modelos que a Conta precifica: o mesmo conjunto de /admin/modelos, sem os ocultos
 * (#496). O estoque conta por modelo_id só nas lojas pedidas; por nome, um modelo de
 * outra Conta com o mesmo nome levava o estoque desta.
 */
export async function catalogoDePrecificacao(contaId: string, lojaIds: string[], exec: Executor = db) {
  const [catalogo, estoque] = await Promise.all([
    listarModelosDaConta(contaId, exec),
    lojaIds.length === 0 ? [] : exec
      .select({ modeloId: motos.modeloId, qtd: sql<number>`count(*)::int` })
      .from(motos)
      .where(and(eq(motos.disponibilidade, 'disponivel'), inArray(motos.lojaId, lojaIds)))
      .groupBy(motos.modeloId),
  ])
  const qtdPorModelo = new Map(estoque.map(e => [e.modeloId, e.qtd]))
  return catalogo.map(m => ({
    id: m.id,
    modelo: m.modeloOriginal,
    marca: m.marca,
    estoqueDisponivel: qtdPorModelo.get(m.id) ?? 0,
  }))
}

/** O nome é de um modelo que a Conta precifica? Fora dela responde igual a inexistente. */
export async function modeloPrecificavel(contaId: string, nome: string, exec: Executor = db) {
  const alvo = chaveNome(nome)
  return (await listarModelosDaConta(contaId, exec)).some(m => chaveNome(m.modeloOriginal) === alvo)
}

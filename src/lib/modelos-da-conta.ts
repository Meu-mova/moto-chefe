import { asc, eq, inArray, notExists, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contaMarcas, modelos } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select'>

// Visibilidade das marcas por Conta (#287, adendo ao ADR-0018). Vale só para as
// listas de escolha: moto já gravada com modelo de marca escondida continua aparecendo.
// Sem next/headers, para ser testado contra o banco.

export async function listarModelosDaConta(contaId: string, exec: Executor = db) {
  const marcasDaConta = exec.select({ marca: contaMarcas.marca }).from(contaMarcas)
    .where(eq(contaMarcas.contaId, contaId))
  return exec.select().from(modelos)
    .where(or(notExists(marcasDaConta), inArray(modelos.marca, marcasDaConta)))
    .orderBy(asc(modelos.marca), asc(modelos.modelo))
}

export async function listarMarcasDaConta(contaId: string, exec: Executor = db): Promise<string[]> {
  const linhas = await exec.select({ marca: contaMarcas.marca }).from(contaMarcas)
    .where(eq(contaMarcas.contaId, contaId)).orderBy(asc(contaMarcas.marca))
  return linhas.map(l => l.marca)
}

// Lista vazia volta ao padrão: a Conta vê todas as marcas.
export async function salvarMarcasDaConta(contaId: string, marcas: string[], exec: Pick<typeof db, 'transaction'> = db) {
  const unicas = [...new Set(marcas.map(m => m.trim()).filter(Boolean))]
  await exec.transaction(async tx => {
    await tx.delete(contaMarcas).where(eq(contaMarcas.contaId, contaId))
    if (unicas.length) await tx.insert(contaMarcas).values(unicas.map(marca => ({ contaId, marca })))
  })
}

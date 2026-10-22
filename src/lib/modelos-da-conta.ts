import { and, asc, eq, inArray, isNull, notExists, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contaMarcas, modeloApelidos, modelos } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select'>

// Visibilidade das marcas por Conta (#287, adendo ao ADR-0018). Vale só para as
// listas de escolha: moto já gravada com modelo de marca escondida continua aparecendo.
// Sem next/headers, para ser testado contra o banco.

// Conta nova nasce vendo só a marca da fábrica (decisão do Luis, 21/10). A grafia
// tem de bater com `modelos.marca`.
export const MARCAS_DA_CONTA_NOVA = ['MotoChefe']

export async function listarModelosDaConta(contaId: string, exec: Executor = db) {
  const marcasDaConta = exec.select({ marca: contaMarcas.marca }).from(contaMarcas)
    .where(eq(contaMarcas.contaId, contaId))
  // O modelo da própria Conta aparece mesmo de marca fora da escolha: foi ela que cadastrou (#321).
  const daPlataformaNasMarcas = and(isNull(modelos.contaId), or(notExists(marcasDaConta), inArray(modelos.marca, marcasDaConta)))
  return exec.select().from(modelos)
    .where(or(daPlataformaNasMarcas, eq(modelos.contaId, contaId)))
    .orderBy(asc(modelos.marca), asc(modelos.modelo))
}

// Apelidos que as notas usam ("DRIFT" para DRIFT CAR): os da plataforma e os da Conta.
// Não são por grupo: é como o FORNECEDOR escreve, e ele vende para os vários CNPJs.
export async function listarApelidosDaConta(contaId: string, exec: Executor = db) {
  return exec
    .select({ nome: modeloApelidos.apelido, canonico: modelos.modelo, modeloId: modelos.id })
    .from(modeloApelidos)
    .innerJoin(modelos, eq(modelos.id, modeloApelidos.modeloId))
    .where(or(isNull(modeloApelidos.contaId), eq(modeloApelidos.contaId, contaId)))
    .orderBy(asc(modeloApelidos.apelido))
}

// Para conferir um modeloId vindo do navegador: um id forjado não pode ligar a moto
// ao modelo de outra Conta.
export async function modelosUsaveisPelaConta(contaId: string, ids: string[], exec: Executor = db): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const linhas = await exec.select({ id: modelos.id }).from(modelos)
    .where(and(inArray(modelos.id, ids), or(isNull(modelos.contaId), eq(modelos.contaId, contaId))))
  return new Set(linhas.map(l => l.id))
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

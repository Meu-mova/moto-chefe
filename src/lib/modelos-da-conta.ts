import { and, asc, eq, inArray, isNull, ne, notExists, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contaMarcas, demandas, modeloApelidos, modeloBlingCodigos, modelos, motos } from '@/lib/db/schema'
import { contaDaLoja } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

// O que a Conta pode usar: o catálogo da plataforma (conta_id nulo) e o dela.
const daPlataformaOuDa = (coluna: typeof modelos.contaId | typeof modeloApelidos.contaId, contaId: string) =>
  or(isNull(coluna), eq(coluna, contaId))

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
    .where(daPlataformaOuDa(modeloApelidos.contaId, contaId))
    .orderBy(asc(modeloApelidos.apelido))
}

// Para conferir um modeloId vindo do navegador: um id forjado não pode ligar a moto
// ao modelo de outra Conta.
export async function modelosUsaveisPelaConta(contaId: string, ids: string[], exec: Executor = db): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const linhas = await exec.select({ id: modelos.id }).from(modelos)
    .where(and(inArray(modelos.id, ids), daPlataformaOuDa(modelos.contaId, contaId)))
  return new Set(linhas.map(l => l.id))
}

export async function modeloUsavelNaLoja(lojaId: string, modeloId: string, exec: Executor = db): Promise<boolean> {
  return (await modelosUsaveisPelaConta(await contaDaLoja(lojaId, exec), [modeloId], exec)).has(modeloId)
}

// O apelido leva a Conta do modelo e só conflita com os da mesma Conta (ou com os da
// plataforma entre si): o erro nunca cita modelo de outra Conta.
export async function salvarApelidosDoModelo(
  modeloId: string,
  apelidos: string[],
  exec: Pick<typeof db, 'select' | 'transaction'> = db,
) {
  const [modelo] = await exec.select({ contaId: modelos.contaId }).from(modelos).where(eq(modelos.id, modeloId)).limit(1)
  if (!modelo) throw new Error('Modelo não encontrado')

  const conflitos = apelidos.length
    ? await exec
        .select({ apelido: modeloApelidos.apelido, modelo: modelos.modelo })
        .from(modeloApelidos)
        .innerJoin(modelos, eq(modelos.id, modeloApelidos.modeloId))
        .where(and(
          inArray(modeloApelidos.apelido, apelidos),
          ne(modeloApelidos.modeloId, modeloId),
          sql`${modeloApelidos.contaId} is not distinct from ${modelo.contaId}`,
        ))
    : []
  if (conflitos.length) {
    throw new Error(conflitos.map(c => `"${c.apelido}" já é do ${c.modelo}`).join('; '))
  }

  await exec.transaction(async tx => {
    await tx.delete(modeloApelidos).where(eq(modeloApelidos.modeloId, modeloId))
    if (apelidos.length) {
      await tx.insert(modeloApelidos).values(apelidos.map(apelido => ({ apelido, modeloId, contaId: modelo.contaId })))
    }
  })
}

// Depois que uma moto ou demanda usa o modelo, ele só se edita: excluir apagaria a
// referência do histórico.
export async function excluirModelo(modeloId: string, exec: Pick<typeof db, 'select' | 'transaction'> = db) {
  await exec.transaction(async tx => {
    // Trava o modelo: uma moto ou demanda gravada entre a checagem e o delete cairia na FK.
    await tx.select({ id: modelos.id }).from(modelos).where(eq(modelos.id, modeloId)).for('update')
    const [moto] = await tx.select({ id: motos.id }).from(motos).where(eq(motos.modeloId, modeloId)).limit(1)
    if (moto) throw new Error('Há motos com este modelo; ele não pode mais ser excluído, só editado')
    const [demanda] = await tx.select({ id: demandas.id }).from(demandas).where(eq(demandas.modeloId, modeloId)).limit(1)
    if (demanda) throw new Error('Há demandas com este modelo; ele não pode mais ser excluído, só editado')
    await tx.delete(modeloBlingCodigos).where(eq(modeloBlingCodigos.modeloId, modeloId))
    await tx.delete(modelos).where(eq(modelos.id, modeloId))
  })
}

// Avisa, não bloqueia: a Conta pode ter um modelo com o mesmo nome de um da plataforma.
// contaId nulo = cadastro da plataforma, que compara com todos.
export async function avisoDeNomeRepetido(contaId: string | null, nome: string, ignorarId: string | null, exec: Executor = db) {
  const [igual] = await exec.select({ marca: modelos.marca, modelo: modelos.modelo }).from(modelos)
    .where(and(
      sql`lower(${modelos.modelo}) = lower(${nome.trim()})`,
      ignorarId ? ne(modelos.id, ignorarId) : undefined,
      contaId ? daPlataformaOuDa(modelos.contaId, contaId) : undefined,
    ))
    .limit(1)
  return igual ? `Já existe um modelo "${igual.modelo}" (${igual.marca}). Gravado mesmo assim.` : null
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

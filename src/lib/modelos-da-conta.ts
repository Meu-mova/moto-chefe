import { type AnyColumn, and, asc, eq, getTableName, inArray, isNull, ne, not, notExists, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contaMarcas, demandas, modeloAjustes, modeloApelidos, modeloBlingCodigos, modelos, motos } from '@/lib/db/schema'
import { contaDaLoja } from '@/lib/conta'
import { modeloIdDaNota, normalizarModelo } from '@/lib/nfe-entrada'

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

// Valor visto pela Conta: o ajuste dela (#476) ou, sem ajuste, o original.
const comAjuste = <T>(ajuste: unknown, original: unknown) => sql<T>`coalesce(${ajuste}, ${original})`

export async function listarModelosDaConta(contaId: string, exec: Executor = db, { incluirOcultos = false } = {}) {
  const marcasDaConta = exec.select({ marca: contaMarcas.marca }).from(contaMarcas)
    .where(eq(contaMarcas.contaId, contaId))
  // O modelo da própria Conta aparece mesmo de marca fora da escolha: foi ela que cadastrou (#321).
  const daPlataformaNasMarcas = and(isNull(modelos.contaId), or(notExists(marcasDaConta), inArray(modelos.marca, marcasDaConta)))
  const oculto = sql<boolean>`coalesce(${modeloAjustes.oculto}, false)`
  const nome = comAjuste<string>(modeloAjustes.modelo, modelos.modelo)
  return exec.select({
    id: modelos.id,
    marca: modelos.marca,
    modelo: nome,
    // A nota da fábrica traz o nome original, mesmo que a Conta tenha ajustado (#476).
    nomeOriginal: modelos.modelo,
    categoria: comAjuste<typeof modelos.categoria._.data>(modeloAjustes.categoria, modelos.categoria),
    potenciaW: comAjuste<string>(modeloAjustes.potenciaW, modelos.potenciaW),
    motor: comAjuste<string>(modeloAjustes.motor, modelos.motor),
    velocidadeMax: comAjuste<string>(modeloAjustes.velocidadeMax, modelos.velocidadeMax),
    precoCompraPadrao: comAjuste<string | null>(modeloAjustes.precoCompraPadrao, modelos.precoCompraPadrao),
    imagemUrl: comAjuste<string | null>(modeloAjustes.imagemUrl, modelos.imagemUrl),
    contaId: modelos.contaId,
    oculto,
    ajustado: sql<boolean>`(${modeloAjustes.modelo} is not null or ${modeloAjustes.categoria} is not null or ${modeloAjustes.potenciaW} is not null)`,
  }).from(modelos)
    // A Conta no join: o ajuste de outra Conta nunca entra.
    .leftJoin(modeloAjustes, and(eq(modeloAjustes.modeloId, modelos.id), eq(modeloAjustes.contaId, contaId)))
    .where(and(
      or(daPlataformaNasMarcas, eq(modelos.contaId, contaId)),
      incluirOcultos ? undefined : not(oculto),
    ))
    .orderBy(asc(modelos.marca), asc(nome))
}

// Nome do modelo para as consultas que mostram moto, venda, OS etc. (#476): o ajustado
// pela Conta dona da loja do registro, ou o original. Recebe a coluna da loja da linha,
// para nenhuma consulta precisar de parâmetro novo. Colunas qualificadas à mão: em
// consulta sem join o Drizzle não qualifica e o nome casaria com as tabelas de dentro.
// Não aceita coluna de alias(): getTableName devolve a tabela real e a subconsulta
// apontaria para ela sem erro. Ficam com o original de propósito: fiscal (NF própria e
// do Bling, export contábil), precificação (casa pelo nome), relatório da fábrica e
// admin/acoes.
export function nomeDoModeloNaLoja(lojaId: AnyColumn) {
  return nomeDoModeloSql('"modelos"', `"${getTableName(lojaId.table)}"."${lojaId.name}"`)
}

// Para SQL escrito à mão, com alias: nomeDoModeloSql('mo', 'v.loja_id'). Vai cru para o
// SQL: só literais do código, nunca entrada do usuário.
export function nomeDoModeloSql(modelos: string, lojaId: string) {
  return sql<string>`coalesce((
    select ma.modelo from modelo_ajustes ma
      join grupos g on g.conta_id = ma.conta_id
      join lojas l on l.grupo_id = g.id
     where ma.modelo_id = ${sql.raw(`${modelos}.id`)} and l.id = ${sql.raw(lojaId)}
  ), ${sql.raw(`${modelos}.modelo`)})`
}

type Escritor = Pick<typeof db, 'select' | 'insert' | 'update'>

// Só modelo da plataforma se ajusta; o da Conta se edita. Id de modelo de outra Conta
// recebe a mesma frase de id inexistente.
async function exigirDaPlataforma(modeloId: string, exec: Executor) {
  const [modelo] = await exec.select({ modelo: modelos.modelo, categoria: modelos.categoria, potenciaW: modelos.potenciaW })
    .from(modelos).where(and(eq(modelos.id, modeloId), isNull(modelos.contaId))).limit(1)
  if (!modelo) throw new Error('Modelo não encontrado')
  return modelo
}

type CamposAjustaveis = Pick<typeof modeloAjustes.$inferInsert, 'modelo' | 'categoria' | 'potenciaW'>

async function gravarAjuste(contaId: string, modeloId: string, set: Partial<typeof modeloAjustes.$inferInsert>, exec: Escritor) {
  await exigirDaPlataforma(modeloId, exec)
  await exec.insert(modeloAjustes)
    .values({ contaId, modeloId, ...set })
    .onConflictDoUpdate({
      target: [modeloAjustes.contaId, modeloAjustes.modeloId],
      set: { ...set, atualizadoEm: new Date() },
      setWhere: eq(modeloAjustes.contaId, contaId),
    })
}

// Campo igual ao original grava nulo: fica da Conta só o que ela mudou, e o resto
// acompanha as correções da plataforma.
export async function salvarAjusteDoModelo(contaId: string, modeloId: string, campos: CamposAjustaveis, exec: Escritor = db) {
  const original = await exigirDaPlataforma(modeloId, exec)
  const seMudou = <K extends keyof CamposAjustaveis>(k: K) => (campos[k] === original[k] ? null : campos[k])
  await gravarAjuste(contaId, modeloId, { modelo: seMudou('modelo'), categoria: seMudou('categoria'), potenciaW: seMudou('potenciaW') }, exec)
}

export async function ocultarModelo(contaId: string, modeloId: string, oculto: boolean, exec: Escritor = db) {
  await gravarAjuste(contaId, modeloId, { oculto }, exec)
}

// Volta os valores aos da plataforma; ocultar e mostrar são à parte.
export async function voltarAoOriginal(contaId: string, modeloId: string, exec: Escritor = db) {
  await gravarAjuste(contaId, modeloId, { modelo: null, categoria: null, potenciaW: null }, exec)
}

// Apelidos que as notas usam ("DRIFT" para DRIFT CAR): os da plataforma e os da Conta.
// Não são por grupo: é como o FORNECEDOR escreve, e ele vende para os vários CNPJs.
export async function listarApelidosDaConta(contaId: string, exec: Executor = db) {
  return exec
    .select({ nome: modeloApelidos.apelido, canonico: modelos.modelo, modeloId: modelos.id })
    .from(modeloApelidos)
    .innerJoin(modelos, eq(modelos.id, modeloApelidos.modeloId))
    .where(daPlataformaOuDa(modeloApelidos.contaId, contaId))
    // Os da Conta primeiro: com o mesmo texto, vale o que a Conta escolheu.
    .orderBy(asc(sql`${modeloApelidos.contaId} is null`), asc(modeloApelidos.apelido))
}

// O texto da nota ligado a um modelo na entrada vira apelido da Conta, para a próxima
// nota já casar sozinha (#476). Só depois da entrada gravada, e sem mostrar o campo.
// Texto que já é nome ou apelido de outro modelo não muda de dono: volta um aviso.
export async function lembrarApelidosDaEntrada(
  contaId: string,
  pares: { texto: string; modeloId: string }[],
  exec: Escritor = db,
): Promise<string[]> {
  const escolhas = new Map<string, string>()
  for (const p of pares) {
    const texto = normalizarModelo(p.texto)
    if (texto && !escolhas.has(texto)) escolhas.set(texto, p.modeloId)
  }
  if (!escolhas.size) return []

  const [doCadastro, apelidos] = await Promise.all([
    listarModelosDaConta(contaId, exec, { incluirOcultos: true }),
    listarApelidosDaConta(contaId, exec),
  ])
  // Modelo de outra Conta (id forjado) não está no cadastro e não ganha apelido.
  const nomePorId = new Map(doCadastro.map(m => [m.id, m.modelo]))
  const avisos: string[] = []
  const novos: (typeof modeloApelidos.$inferInsert)[] = []
  for (const [texto, modeloId] of escolhas) {
    if (!nomePorId.has(modeloId)) continue
    const dono = doCadastro.find(m => normalizarModelo(m.modelo) === texto || normalizarModelo(m.nomeOriginal) === texto)?.id
      ?? apelidos.find(a => normalizarModelo(a.nome) === texto)?.modeloId
    if (dono && dono !== modeloId) {
      avisos.push(`"${texto}" já é do ${nomePorId.get(dono) ?? 'outro modelo'}; a próxima nota continua indo para ele, e não para o ${nomePorId.get(modeloId)}.`)
      continue
    }
    if (modeloIdDaNota(texto, doCadastro, apelidos) === modeloId) continue
    novos.push({ apelido: texto, modeloId, contaId })
  }
  if (novos.length) await exec.insert(modeloApelidos).values(novos).onConflictDoNothing()
  return avisos
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
    // Só os da Conta do modelo: num modelo da plataforma ficam também os apelidos que
    // cada Conta aprendeu na entrada (#476), e esses não são de quem edita aqui.
    await tx.delete(modeloApelidos).where(and(
      eq(modeloApelidos.modeloId, modeloId),
      sql`${modeloApelidos.contaId} is not distinct from ${modelo.contaId}`,
    ))
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

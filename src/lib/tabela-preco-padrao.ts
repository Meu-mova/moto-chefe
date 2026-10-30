import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, modeloApelidos, modelos, precificacao, tabelaPrecoPadrao } from '@/lib/db/schema'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'
import { chaveNome } from '@/lib/precificacao-modelos'
import { casarComModelos, lerPlanilhaDePrecos, type ModeloCasavel } from '@/lib/planilha-precos'

type Executor = Pick<typeof db, 'select'>

// A tabela padrão é da plataforma: casa só com modelo e apelido da plataforma. Ajuste,
// apelido ou modelo de uma Conta nunca entram aqui (#522).
export async function modelosDaPlataformaParaPreco(exec: Executor = db): Promise<ModeloCasavel[]> {
  const [lista, apelidos] = await Promise.all([
    exec.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).where(isNull(modelos.contaId)),
    exec.select({ modeloId: modeloApelidos.modeloId, apelido: modeloApelidos.apelido })
      .from(modeloApelidos)
      .innerJoin(modelos, eq(modelos.id, modeloApelidos.modeloId))
      .where(and(isNull(modeloApelidos.contaId), isNull(modelos.contaId))),
  ])
  return lista.map(m => ({
    id: m.id,
    nomes: [m.modelo, ...apelidos.filter(a => a.modeloId === m.id).map(a => a.apelido)],
  }))
}

/**
 * Troca a tabela padrão inteira pela planilha. Modelo fora da planilha nova sai da tabela.
 * Planilha sem as colunas não apaga nada.
 */
export async function carregarTabelaPadrao(
  dados: { matriz: unknown[][]; competencia: string; usuarioId: string | null; confirmarQueda?: boolean },
  exec: Pick<typeof db, 'select' | 'transaction'> = db,
) {
  if (!/^\d{4}-\d{2}$/.test(dados.competencia)) return { ok: false as const, erro: 'Informe o mês da tabela' }
  const lida = lerPlanilhaDePrecos(dados.matriz)
  if (!lida.linhas.length) return { ok: false as const, erro: lida.erros[0] ?? 'Planilha sem nenhum preço' }

  const { casados, avisos } = casarComModelos(lida.linhas, await modelosDaPlataformaParaPreco(exec))
  if (!casados.length) return { ok: false as const, erro: 'Nenhuma linha casou com um modelo da plataforma', avisos: [...lida.erros, ...avisos] }

  const todosAvisos = [...lida.erros, ...avisos]
  return exec.transaction(async tx => {
    const [{ anteriores }] = await tx.select({ anteriores: sql<number>`count(*)::int` }).from(tabelaPrecoPadrao)
    // Planilha que casou bem menos modelos que a tabela atual pede confirmação: sem ela, uma
    // planilha cortada trocaria a tabela inteira por poucos modelos sem ninguém notar.
    if (!dados.confirmarQueda && casados.length < anteriores * 0.8) {
      return { ok: false as const, confirmar: true as const, anteriores, gravados: casados.length, avisos: todosAvisos }
    }
    await tx.delete(tabelaPrecoPadrao)
    await tx.insert(tabelaPrecoPadrao).values(casados.map(c => ({
      modeloId: c.modeloId,
      preco: c.preco.toFixed(2),
      competencia: dados.competencia,
      carregadoPor: dados.usuarioId,
    })))
    return { ok: true as const, anteriores, gravados: casados.length, avisos: todosAvisos }
  })
}

export async function listarTabelaPadrao(exec: Executor = db) {
  return exec
    .select({
      modeloId: tabelaPrecoPadrao.modeloId,
      marca: modelos.marca,
      modelo: modelos.modelo,
      preco: tabelaPrecoPadrao.preco,
      competencia: tabelaPrecoPadrao.competencia,
      carregadoEm: tabelaPrecoPadrao.carregadoEm,
    })
    .from(tabelaPrecoPadrao)
    .innerJoin(modelos, eq(modelos.id, tabelaPrecoPadrao.modeloId))
    .orderBy(asc(modelos.marca), asc(modelos.modelo))
}

type Escritor = Pick<typeof db, 'select' | 'transaction'>

// Sem índice único em precificacao (grupo, nome): quem confere "já tem preço?" e depois insere
// segura esta trava do grupo até o fim da transação, para duas gravações não criarem o mesmo modelo.
export async function travarPrecificacaoDoGrupo(tx: Pick<typeof db, 'execute'>, grupoId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`precificacao:${grupoId}`}))`)
}

/**
 * Preço padrão nos modelos que o grupo ainda não precificou (#522). Só insere: preço que já
 * existe, digitado, importado ou vindo daqui, nunca muda. O modelo precisa estar no catálogo
 * visível da Conta do grupo, então a marca vem do vínculo da tabela com o modelo e das marcas
 * da Conta, e o modelo oculto fica de fora. Devolve quantos preços entraram.
 */
export async function preencherGruposComPrecoPadrao(grupoIds: string[], exec: Escritor = db) {
  if (!grupoIds.length) return 0
  const padrao = await exec.select({ modeloId: tabelaPrecoPadrao.modeloId, preco: tabelaPrecoPadrao.preco }).from(tabelaPrecoPadrao)
  if (!padrao.length) return 0
  const precoDoModelo = new Map(padrao.map(p => [p.modeloId, p.preco]))

  const alvos = await exec.select({ id: grupos.id, contaId: grupos.contaId }).from(grupos).where(inArray(grupos.id, grupoIds))
  const catalogoDaConta = new Map<string, Awaited<ReturnType<typeof listarModelosDaConta>>>()
  let inseridos = 0
  for (const g of alvos) {
    if (!catalogoDaConta.has(g.contaId)) catalogoDaConta.set(g.contaId, await listarModelosDaConta(g.contaId, exec))
    const catalogo = catalogoDaConta.get(g.contaId)!
    inseridos += await exec.transaction(async tx => {
      await travarPrecificacaoDoGrupo(tx, g.id)
      const existentes = new Set((await tx.select({ nome: precificacao.nome }).from(precificacao)
        .where(eq(precificacao.grupoId, g.id))).map(p => chaveNome(p.nome)))
      const novos: (typeof precificacao.$inferInsert)[] = []
      for (const m of catalogo) {
        const nome = chaveNome(m.modeloOriginal)
        if (!precoDoModelo.has(m.id) || existentes.has(nome)) continue
        existentes.add(nome)
        novos.push({ grupoId: g.id, nome, valorMinimo: precoDoModelo.get(m.id)! })
      }
      if (novos.length) await tx.insert(precificacao).values(novos)
      return novos.length
    })
  }
  return inseridos
}

export async function preencherContaComPrecoPadrao(contaId: string, exec: Escritor = db) {
  const ids = await exec.select({ id: grupos.id }).from(grupos).where(eq(grupos.contaId, contaId))
  return preencherGruposComPrecoPadrao(ids.map(g => g.id), exec)
}

export async function preencherTodosComPrecoPadrao(exec: Escritor = db) {
  const ids = await exec.select({ id: grupos.id }).from(grupos)
  return preencherGruposComPrecoPadrao(ids.map(g => g.id), exec)
}

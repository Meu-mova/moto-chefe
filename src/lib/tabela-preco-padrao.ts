import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { modeloApelidos, modelos, tabelaPrecoPadrao } from '@/lib/db/schema'
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
  dados: { matriz: unknown[][]; competencia: string; usuarioId: string | null },
  exec: Pick<typeof db, 'select' | 'transaction'> = db,
) {
  if (!/^\d{4}-\d{2}$/.test(dados.competencia)) return { ok: false as const, erro: 'Informe o mês da tabela' }
  const lida = lerPlanilhaDePrecos(dados.matriz)
  if (!lida.linhas.length) return { ok: false as const, erro: lida.erros[0] ?? 'Planilha sem nenhum preço' }

  const { casados, avisos } = casarComModelos(lida.linhas, await modelosDaPlataformaParaPreco(exec))
  if (!casados.length) return { ok: false as const, erro: 'Nenhuma linha casou com um modelo da plataforma', avisos: [...lida.erros, ...avisos] }

  await exec.transaction(async tx => {
    await tx.delete(tabelaPrecoPadrao)
    await tx.insert(tabelaPrecoPadrao).values(casados.map(c => ({
      modeloId: c.modeloId,
      preco: c.preco.toFixed(2),
      competencia: dados.competencia,
      carregadoPor: dados.usuarioId,
    })))
  })
  return { ok: true as const, gravados: casados.length, avisos: [...lida.erros, ...avisos] }
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

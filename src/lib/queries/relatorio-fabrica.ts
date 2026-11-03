import { listarLojaIdsDoGrupoAtivo, getGrupoAtivo } from '@/lib/grupo'
import { hojeBrt } from '../data-venda'
import { db } from '@/lib/db'
import { vendas, motos, modelos, lojas } from '@/lib/db/schema'
import { eq, inArray, and, gte, lt, sql } from 'drizzle-orm'
import {
  LOJAS_FORA_RELATORIO_FABRICA,
  agruparPorLoja,
  type LinhaModeloLoja,
} from '@/lib/relatorio-fabrica'
import type { getUsuarioLogado } from '@/lib/auth'
import { MARCA_DA_FABRICA } from '@/lib/modelos-da-conta'

type UsuarioLogado = Awaited<ReturnType<typeof getUsuarioLogado>>

function primeiroDiaDoMes(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}-01`
}
function hoje(): string {
  return hojeBrt()
}

// Limites em UTC, de propósito: é a mesma convenção de /financeiro e da Folha de
// Pagamento, então os números batem quando o Cesar confere um contra o outro.
function inicioDoDia(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00.000Z`)
}
function diaSeguinte(yyyyMmDd: string): Date {
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

/** Normaliza os parâmetros de período, caindo no mês corrente quando faltam. */
export function normalizarPeriodo(de?: string, ate?: string): { de: string; ate: string } {
  return {
    de: /^\d{4}-\d{2}-\d{2}$/.test(de ?? '') ? de! : primeiroDiaDoMes(),
    ate: /^\d{4}-\d{2}-\d{2}$/.test(ate ?? '') ? ate! : hoje(),
  }
}

/** Vendas de moto da marca da fábrica nas lojas e no período, por modelo × loja. Sem sessão, para o teste de banco. */
export async function linhasRelatorioFabrica(lojaIds: string[], de: string, ate: string, exec: Pick<typeof db, 'select'> = db): Promise<LinhaModeloLoja[]> {
  if (lojaIds.length === 0) return []
  return exec
    .select({
      modeloId:   modelos.id,
      marca:      modelos.marca,
      modelo:     modelos.modelo,
      lojaId:     lojas.id,
      lojaNome:   lojas.nome,
      quantidade: sql<number>`COUNT(*)::int`,
      valor:      sql<number>`COALESCE(SUM(${vendas.valor}::numeric), 0)::float8`,
    })
    .from(vendas)
    .innerJoin(motos, eq(vendas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .where(and(
      inArray(vendas.lojaId, lojaIds),
      // Só a marca da fábrica: o relatório vai para a MotoChefe, e moto de outra marca
      // (ex.: Voe) vendida na loja não é da conta dela.
      eq(modelos.marca, MARCA_DA_FABRICA),
      gte(vendas.dataVenda, inicioDoDia(de)),
      lt(vendas.dataVenda, diaSeguinte(ate)),
    ))
    .groupBy(modelos.id, modelos.marca, modelos.modelo, lojas.id, lojas.nome)
}

/**
 * Carrega o relatório de vendas para a fábrica no período, agrupado por loja.
 * Usado tanto pela tela do dashboard quanto pela página de impressão, para que
 * os dois mostrem exatamente os mesmos números.
 */
export async function carregarRelatorioFabrica(
  usuario: UsuarioLogado,
  deRaw?: string,
  ateRaw?: string,
) {
  const { de, ate } = normalizarPeriodo(deRaw, ateRaw)

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const lojaIds = lojaIdsGrupo.filter(id => !LOJAS_FORA_RELATORIO_FABRICA.includes(id))

  const linhas = await linhasRelatorioFabrica(lojaIds, de, ate)

  const grupos = agruparPorLoja(linhas)
  const totalQtd = grupos.reduce((s, g) => s + g.quantidade, 0)
  const totalValor = grupos.reduce((s, g) => s + g.valor, 0)

  const lojasForaNoGrupo = await db
    .select({ nome: lojas.nome })
    .from(lojas)
    .where(inArray(lojas.id, lojaIdsGrupo.filter(id => LOJAS_FORA_RELATORIO_FABRICA.includes(id))))

  return { de, ate, grupo, grupos, totalQtd, totalValor, lojasForaNoGrupo }
}

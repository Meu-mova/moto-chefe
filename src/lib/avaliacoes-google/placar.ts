import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  avaliacoesGoogleConfig, avaliacoesGooglePlacas, avaliacoesGoogleToques, avaliacoesGoogleTotalMes,
  lojas, usuarios, vendas,
} from '@/lib/db/schema'
import { inicioDoDiaBrt } from '@/lib/data-venda'
import { grupoDoUsuario, mesOuCorrente, proximoMes, type Usuario } from './avaliacoes'

/**
 * Placar do mês: cruza as vendas de moto com o uso das plaquinhas e com as avaliações novas.
 * O Google não diz de qual placa veio cada avaliação, então são duas medidas diferentes:
 * por vendedor, toques ÷ vendas (mostra se ele oferece a avaliação); por loja, avaliações
 * novas ÷ vendas (o resultado real). Toque não é avaliação: a tela nunca soma as duas.
 */

const META_PADRAO = 80

export type ProgressoMeta = {
  /** % do realizado sobre as vendas; null sem venda no mês ou sem leitura do total. */
  pct: number | null
  /** Quantos faltam para a meta; 0 quando já chegou. */
  faltam: number
}

export type LinhaVendedor = ProgressoMeta & {
  usuarioId: string
  nome: string
  lojaId: string
  lojaNome: string
  vendas: number
  toques: number
  temPlaca: boolean
}

export type LinhaLoja = ProgressoMeta & {
  lojaId: string
  nome: string
  vendas: number
  toques: number
  /** Avaliações novas no mês; null se o MOVA ainda não leu o total da loja neste mês. */
  novas: number | null
  /** Primeira leitura do mês: as avaliações novas contam a partir daqui. */
  desde: string | null
}

export type Placar = { mes: string; metaPct: number; vendedores: LinhaVendedor[]; lojas: LinhaLoja[] }

/** Meta arredondada para cima: 80% de 19 vendas são 16, porque 15 ficaria em 78,9%. */
export function progressoMeta(realizado: number | null, vendas: number, metaPct: number): ProgressoMeta {
  const r = realizado ?? 0
  return {
    pct: vendas > 0 && realizado !== null ? Math.round((r / vendas) * 100) : null,
    faltam: Math.max(0, Math.ceil((vendas * metaPct) / 100) - r),
  }
}

export async function placarAvaliacoes(
  usuario: Usuario,
  grupoId: string,
  exec: Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'> = db,
  opcoes: { mes?: string; agora?: Date } = {},
): Promise<Placar | null> {
  if (!(await grupoDoUsuario(usuario, grupoId, exec))) return null

  const mes = mesOuCorrente(opcoes.mes, opcoes.agora)
  const inicio = inicioDoDiaBrt(`${mes}-01`).toISOString()
  const fim = inicioDoDiaBrt(`${proximoMes(mes)}-01`).toISOString()

  const doGrupo = await exec.select({ id: lojas.id, nome: lojas.nome, ativa: lojas.ativa })
    .from(lojas).where(eq(lojas.grupoId, grupoId)).orderBy(lojas.nome)
  const lojaIds = doGrupo.map(l => l.id)
  if (lojaIds.length === 0) return { mes, metaPct: META_PADRAO, vendedores: [], lojas: [] }

  const [config, vendasMes, toquesMes, placas, totais] = await Promise.all([
    exec.select({ metaPct: avaliacoesGoogleConfig.metaPct }).from(avaliacoesGoogleConfig)
      .where(eq(avaliacoesGoogleConfig.grupoId, grupoId)).limit(1),
    exec.select({ usuarioId: vendas.vendedorId, nome: usuarios.nome, lojaId: vendas.lojaId, n: sql<number>`count(*)::int` })
      .from(vendas)
      .innerJoin(usuarios, eq(usuarios.id, vendas.vendedorId))
      .where(and(
        inArray(vendas.lojaId, lojaIds),
        gte(vendas.dataVenda, sql`${inicio}::timestamptz`),
        lt(vendas.dataVenda, sql`${fim}::timestamptz`),
      ))
      .groupBy(vendas.vendedorId, usuarios.nome, vendas.lojaId),
    exec.select({ usuarioId: avaliacoesGoogleToques.usuarioId, nome: usuarios.nome, lojaId: avaliacoesGoogleToques.lojaId, n: sql<number>`count(*)::int` })
      .from(avaliacoesGoogleToques)
      .leftJoin(usuarios, eq(usuarios.id, avaliacoesGoogleToques.usuarioId))
      .where(and(
        eq(avaliacoesGoogleToques.grupoId, grupoId),
        gte(avaliacoesGoogleToques.criadoEm, sql`${inicio}::timestamptz`),
        lt(avaliacoesGoogleToques.criadoEm, sql`${fim}::timestamptz`),
      ))
      .groupBy(avaliacoesGoogleToques.usuarioId, usuarios.nome, avaliacoesGoogleToques.lojaId),
    exec.select({ usuarioId: avaliacoesGooglePlacas.usuarioId, nome: usuarios.nome, lojaId: avaliacoesGooglePlacas.lojaId })
      .from(avaliacoesGooglePlacas)
      .innerJoin(usuarios, eq(usuarios.id, avaliacoesGooglePlacas.usuarioId))
      .where(and(eq(avaliacoesGooglePlacas.grupoId, grupoId), eq(avaliacoesGooglePlacas.ativa, true))),
    exec.select({
      lojaId: avaliacoesGoogleTotalMes.lojaId, inicial: avaliacoesGoogleTotalMes.totalInicial,
      final: avaliacoesGoogleTotalMes.totalFinal, primeiraEm: avaliacoesGoogleTotalMes.primeiraEm,
    })
      .from(avaliacoesGoogleTotalMes)
      .where(and(eq(avaliacoesGoogleTotalMes.grupoId, grupoId), eq(avaliacoesGoogleTotalMes.mes, mes))),
  ])

  const metaPct = config[0]?.metaPct ?? META_PADRAO
  const nomeLoja = new Map(doGrupo.map(l => [l.id, l.nome]))

  // Vendedor por loja: quem vendeu, quem teve toque ou quem tem placa ativa, mesmo com zero.
  type Soma = { usuarioId: string; nome: string; lojaId: string; vendas: number; toques: number; temPlaca: boolean }
  const somas = new Map<string, Soma>()
  const daPessoa = (usuarioId: string, nome: string, lojaId: string) => {
    const chave = `${usuarioId}|${lojaId}`
    let s = somas.get(chave)
    if (!s) somas.set(chave, s = { usuarioId, nome, lojaId, vendas: 0, toques: 0, temPlaca: false })
    return s
  }
  for (const v of vendasMes) daPessoa(v.usuarioId, v.nome, v.lojaId).vendas += v.n
  for (const t of toquesMes) if (t.usuarioId && t.nome) daPessoa(t.usuarioId, t.nome, t.lojaId).toques += t.n
  for (const p of placas) if (p.usuarioId) daPessoa(p.usuarioId, p.nome, p.lojaId).temPlaca = true

  const vendedores: LinhaVendedor[] = [...somas.values()]
    .map(s => ({ ...s, lojaNome: nomeLoja.get(s.lojaId) ?? '', ...progressoMeta(s.toques, s.vendas, metaPct) }))
    .sort((a, b) => b.vendas - a.vendas || a.nome.localeCompare(b.nome))

  const soma = (linhas: { lojaId: string; n: number }[], lojaId: string) =>
    linhas.filter(l => l.lojaId === lojaId).reduce((s, l) => s + l.n, 0)

  const linhasLoja: LinhaLoja[] = doGrupo.flatMap(l => {
    const qtdVendas = soma(vendasMes, l.id)
    const toques = soma(toquesMes, l.id)
    // Loja desativada só aparece se teve movimento no mês.
    if (!l.ativa && qtdVendas === 0 && toques === 0) return []
    const t = totais.find(x => x.lojaId === l.id)
    // O total também cai quando o Google remove avaliação; o placar não mostra número negativo.
    const novas = t ? Math.max(0, t.final - t.inicial) : null
    return [{
      lojaId: l.id, nome: l.nome, vendas: qtdVendas, toques, novas,
      desde: t?.primeiraEm.toISOString() ?? null,
      ...progressoMeta(novas, qtdVendas, metaPct),
    }]
  })

  return { mes, metaPct, vendedores, lojas: linhasLoja }
}

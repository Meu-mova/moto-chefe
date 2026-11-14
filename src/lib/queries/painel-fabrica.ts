// Consultas do Painel da Fábrica MotoChefe (regra em @/lib/painel-fabrica).
//
// Lê TODAS as Contas de propósito: é tela da plataforma, só do admin_geral (item
// `painel-fabrica`, soAdminGeral, em @/lib/navegacao). Quem chama confere o acesso
// antes. O select é a fronteira do que a fábrica pode ver (#892): da loja, só o nome;
// da venda, só data, número, modelo, cor e chassi. O que não é lido aqui não chega
// à tela, ao Excel nem ao navegador.
import { and, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contas, grupos, lojas, modelos, motos, vendas } from '@/lib/db/schema'
import { motoNoShowroom } from '@/lib/queries/showroom'
import { normalizarPeriodo } from '@/lib/queries/relatorio-fabrica'
import { fimDoDiaBrt, inicioDoDiaBrt } from '@/lib/data-venda'
import type { LinhaEstoquePainel, LojaPainel, VendaPainel } from '@/lib/painel-fabrica'

// Mesma chave de ehMarcaDoPainel (@/lib/painel-fabrica): só letras, minúsculas. O
// translate cobre o acento que o regexp sozinho apagaria ("Motochéfe" → "motochfe").
const marcaDoPainel = () => sql`regexp_replace(lower(translate(${modelos.marca}, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')), '[^a-z]', '', 'g') = 'motochefe'`

/** Loja MotoChefe: ativa, de grupo e Conta ativos, com login do portal da fábrica. */
const lojaDoPainel = () => and(
  eq(lojas.ativa, true),
  ne(sql`coalesce(trim(${lojas.fabricaEmail}), '')`, ''),
  eq(grupos.ativo, true),
  isNull(contas.desativadaEm),
)!

const modeloExibido = sql<string>`upper(trim(${modelos.modelo}))`
const corExibida = sql<string>`upper(trim(${motos.cor}))`

export async function listarLojasDoPainel(): Promise<LojaPainel[]> {
  return db
    .select({ lojaId: lojas.id, lojaNome: lojas.nome })
    .from(lojas)
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .innerJoin(contas, eq(grupos.contaId, contas.id))
    .where(lojaDoPainel())
    .orderBy(lojas.nome)
}

/** Estoque de hoje (mesma regra do Showroom), por loja × modelo × cor. */
export async function estoqueDoPainel(): Promise<LinhaEstoquePainel[]> {
  return db
    .select({ lojaId: lojas.id, modelo: modeloExibido, cor: corExibida, quantidade: sql<number>`count(*)::int` })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .innerJoin(contas, eq(grupos.contaId, contas.id))
    .where(and(lojaDoPainel(), marcaDoPainel(), motoNoShowroom()))
    .groupBy(lojas.id, modeloExibido, corExibida)
}

/** Motos MotoChefe vendidas no período (dias de Brasília), uma linha por venda. */
export async function vendasDoPainel(de: string, ate: string): Promise<VendaPainel[]> {
  const linhas = await db
    .select({
      data: vendas.dataVenda, numero: vendas.numero,
      lojaId: lojas.id, modelo: modeloExibido, cor: corExibida, chassi: motos.chassi,
    })
    .from(vendas)
    .innerJoin(motos, eq(vendas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .innerJoin(contas, eq(grupos.contaId, contas.id))
    .where(and(
      lojaDoPainel(),
      marcaDoPainel(),
      gte(vendas.dataVenda, inicioDoDiaBrt(de)),
      lte(vendas.dataVenda, fimDoDiaBrt(ate)),
    ))
  return linhas.map(l => ({ ...l, data: l.data.toISOString() }))
}

export async function carregarPainelFabrica(deRaw?: string, ateRaw?: string) {
  const { de, ate } = normalizarPeriodo(deRaw, ateRaw)
  const [lojasPainel, estoque, vendidas] = await Promise.all([
    listarLojasDoPainel(), estoqueDoPainel(), vendasDoPainel(de, ate),
  ])
  return { de, ate, lojas: lojasPainel, estoque, vendas: vendidas }
}

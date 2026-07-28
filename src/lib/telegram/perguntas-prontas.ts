import { normalizar } from './texto'

export interface Pergunta {
  id: string
  titulo: string
  casa: (t: string) => boolean
  sql: string
  formatar: (rows: any[]) => string
}

const brl = (v: number | string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0))
const tem = (t: string, ...ps: string[]) => ps.every((p) => t.includes(p))

// mês corrente, fuso São Paulo — reaproveitado por várias perguntas
const NO_MES = `(v.data_venda AT TIME ZONE 'America/Sao_Paulo') >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))`

const SQL_POR_VENDEDOR = `
SELECT u.nome AS vendedor, count(*)::int AS qtd, coalesce(sum(v.valor),0)::numeric AS total
FROM vendas v JOIN usuarios u ON u.id = v.vendedor_id
WHERE ${NO_MES}
GROUP BY u.nome ORDER BY total DESC`.trim()

const SQL_POR_LOJA = `
SELECT l.nome AS loja, count(*)::int AS qtd, coalesce(sum(v.valor),0)::numeric AS total
FROM vendas v JOIN lojas l ON l.id = v.loja_id
WHERE ${NO_MES}
GROUP BY l.nome ORDER BY total DESC`.trim()

const SQL_POR_MODELO = `
SELECT (mo.marca || ' ' || mo.modelo) AS modelo, count(*)::int AS qtd, coalesce(sum(v.valor),0)::numeric AS total
FROM vendas v JOIN motos m ON m.id = v.moto_id JOIN modelos mo ON mo.id = m.modelo_id
WHERE ${NO_MES}
GROUP BY mo.marca, mo.modelo ORDER BY qtd DESC`.trim()

// formatadores reutilizáveis
const linhas = (rows: any[], rotulo: (r: any) => string, comValor: boolean) =>
  rows.length === 0
    ? 'Nada encontrado no período.'
    : rows
        .map((r) => `• ${rotulo(r)} — ${r.qtd} venda(s)${comValor ? ` — ${brl(r.total)}` : ''}`)
        .join('\n')

const ranking = (rows: any[], rotulo: (r: any) => string, comValor: boolean) =>
  rows.length === 0
    ? 'Nada encontrado no período.'
    : rows
        .map((r, i) => `${i + 1}. ${rotulo(r)} — ${r.qtd} venda(s)${comValor ? ` — ${brl(r.total)}` : ''}`)
        .join('\n')

const totalPeriodo = (titulo: string) => (rows: any[]) => {
  const r = rows[0] ?? { qtd: 0, total: 0 }
  return `${titulo}: ${r.qtd} venda(s), ${brl(r.total)}.`
}

export const CATALOGO: Pergunta[] = [
  // específicas primeiro (primeira que casa vence)
  {
    id: 'estoque_por_modelo',
    titulo: 'Estoque por modelo',
    casa: (t) => t.includes('estoque') || tem(t, 'unidade', 'modelo'),
    sql: `
SELECT (mo.marca || ' ' || mo.modelo) AS modelo, count(*)::int AS qtd
FROM motos m JOIN modelos mo ON mo.id = m.modelo_id
WHERE m.status IN ('montada', 'caixa')
GROUP BY mo.marca, mo.modelo ORDER BY qtd DESC`.trim(),
    formatar: (rows) =>
      rows.length === 0
        ? 'Sem motos em estoque (montada/caixa).'
        : `🏍️ Estoque (montada + caixa):\n` +
          rows.map((r) => `• ${r.modelo} — ${r.qtd} un`).join('\n') +
          `\nTotal: ${rows.reduce((s, r) => s + Number(r.qtd), 0)} un`,
  },
  {
    id: 'ranking_vendedores',
    titulo: 'Ranking de vendedores (mês)',
    casa: (t) => tem(t, 'ranking', 'vendedor'),
    sql: SQL_POR_VENDEDOR,
    formatar: (rows) => `🏆 Ranking de vendedores (mês):\n` + ranking(rows, (r) => r.vendedor, true),
  },
  {
    id: 'ranking_lojas',
    titulo: 'Ranking de lojas (mês)',
    casa: (t) => tem(t, 'ranking', 'loja'),
    sql: SQL_POR_LOJA,
    formatar: (rows) => `🏆 Ranking de lojas (mês):\n` + ranking(rows, (r) => r.loja, true),
  },
  {
    id: 'ranking_motos',
    titulo: 'Ranking de motos vendidas (mês)',
    casa: (t) => t.includes('ranking') && (t.includes('moto') || t.includes('modelo') || t.includes('vendida')),
    sql: SQL_POR_MODELO,
    formatar: (rows) => `🏆 Motos mais vendidas (mês):\n` + ranking(rows, (r) => r.modelo, false),
  },
  {
    id: 'vendas_por_vendedor',
    titulo: 'Vendas por vendedor (mês)',
    casa: (t) => tem(t, 'venda', 'vendedor'),
    sql: SQL_POR_VENDEDOR,
    formatar: (rows) => `Vendas por vendedor (mês):\n` + linhas(rows, (r) => r.vendedor, true),
  },
  {
    id: 'vendas_por_loja',
    titulo: 'Vendas por loja (mês)',
    casa: (t) => tem(t, 'venda', 'loja'),
    sql: SQL_POR_LOJA,
    formatar: (rows) => `Vendas por loja (mês):\n` + linhas(rows, (r) => r.loja, true),
  },
  {
    id: 'vendas_por_modelo',
    titulo: 'Vendas por modelo (mês)',
    casa: (t) => t.includes('venda') && (t.includes('modelo') || t.includes('moto')),
    sql: SQL_POR_MODELO,
    formatar: (rows) => `Vendas por modelo (mês):\n` + linhas(rows, (r) => r.modelo, true),
  },
  {
    id: 'vendas_hoje',
    titulo: 'Vendas hoje',
    casa: (t) => tem(t, 'venda', 'hoje'),
    sql: `
SELECT count(*)::int AS qtd, coalesce(sum(valor),0)::numeric AS total
FROM vendas
WHERE (data_venda AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date`.trim(),
    formatar: totalPeriodo('Vendas hoje'),
  },
  {
    id: 'vendas_mes',
    titulo: 'Vendas no mês',
    casa: (t) => t.includes('venda') && (t.includes('mes') || t.includes('mês')),
    sql: `
SELECT count(*)::int AS qtd, coalesce(sum(valor),0)::numeric AS total
FROM vendas
WHERE (data_venda AT TIME ZONE 'America/Sao_Paulo') >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))`.trim(),
    formatar: totalPeriodo('Vendas no mês'),
  },
]

export function acharPergunta(texto: string): Pergunta | undefined {
  const t = normalizar(texto)
  return CATALOGO.find((p) => p.casa(t))
}

export function porId(id: string): Pergunta | undefined {
  return CATALOGO.find((p) => p.id === id)
}

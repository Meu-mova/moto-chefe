import { sql } from 'drizzle-orm'
import { vendas, conciliacoesCartao } from '@/lib/db/schema'

/**
 * Valor da venda com a parte já conciliada trocada pelo líquido da operadora.
 *
 * A parte não paga em cartão fica como está; a paga em cartão E já conciliada
 * vira o líquido. Cobre venda com forma "multiplos" (cartão + pix/dinheiro), em
 * que descartar a parte não-cartão zeraria dinheiro que entrou de verdade.
 *
 * Enquanto a conciliação não chega, a venda entra pelo bruto — o líquido do mês
 * corrente é sempre otimista e encolhe conforme as transações casam.
 *
 * Vivia copiada em queries/dashboard.ts e no /financeiro; o DRE seria a terceira
 * cópia da mesma expressão, e três cópias de uma regra de dinheiro é uma a mais
 * do que dá para manter em sincronia.
 */
export function valorLiquidoExpr() {
  return sql`(
    ${vendas.valor}::numeric
    - COALESCE((SELECT SUM(${conciliacoesCartao.valorBruto}::numeric)
                FROM ${conciliacoesCartao}
                WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
                  AND ${conciliacoesCartao.conciliado} = true), 0)
    + COALESCE((SELECT SUM(${conciliacoesCartao.valorLiquido}::numeric)
                FROM ${conciliacoesCartao}
                WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
                  AND ${conciliacoesCartao.conciliado} = true), 0)
  )`
}

/**
 * A MESMA regra da valorLiquidoExpr(), para as queries em SQL cru (execRows(sql``))
 * onde a tabela vendas entra sob um alias — os relatórios de fechamento, coletiva
 * e individual. `v` é o alias de vendas na query externa (ex.: `from vendas v`).
 *
 * As duas formas moram juntas de propósito: são a mesma regra de dinheiro e
 * precisam mudar em conjunto se a conciliação mudar.
 */
export function valorLiquidoSql(v = 'v') {
  const a = sql.raw(v)
  return sql`(
    ${a}.valor::numeric
    - COALESCE((SELECT SUM(cc.valor_bruto::numeric) FROM conciliacoes_cartao cc
                WHERE cc.venda_id = ${a}.id AND cc.conciliado = true), 0)
    + COALESCE((SELECT SUM(cc.valor_liquido::numeric) FROM conciliacoes_cartao cc
                WHERE cc.venda_id = ${a}.id AND cc.conciliado = true), 0)
  )`
}

/**
 * Frete cobrado do cliente (4b da #726): mora em `vendas.entrega->'frete'` e soma no valor da venda, nos
 * pagamentos e no caixa. Ausente ou nulo = sem frete. Só conta na Entrega "entregar", o mesmo critério do
 * `freteDaVenda` de `src/lib/notagateway/entrega.ts`.
 */
export const freteDaVendaExpr = () =>
  sql`CASE WHEN ${vendas.entrega}->>'modo' = 'entregar' THEN COALESCE((${vendas.entrega}->>'frete')::numeric, 0) ELSE 0 END`

/** O mesmo frete para o SQL cru, com `v` como alias de vendas. */
export const freteDaVendaSql = (v = 'v') => {
  const a = sql.raw(v)
  return sql`CASE WHEN ${a}.entrega->>'modo' = 'entregar' THEN COALESCE((${a}.entrega->>'frete')::numeric, 0) ELSE 0 END`
}

/**
 * Valor da MOTO vendida: o valor da venda sem o frete cobrado (#796). Comissão, metas, relatório da fábrica,
 * desconto, rankings e os relatórios de venda de motos usam este; caixa, NF, conciliação, contrato e DRE seguem
 * com o valor da venda (o que o cliente pagou). Venda editada para baixo do frete: mínimo 0 (decisão do Luis, 07/11).
 */
export const valorDaMotoExpr = () => sql`GREATEST(${vendas.valor}::numeric - ${freteDaVendaExpr()}, 0)`
export const valorDaMotoSql = (v = 'v') => sql`GREATEST(${sql.raw(v)}.valor::numeric - ${freteDaVendaSql(v)}, 0)`

/** Líquido da moto: o líquido da venda menos o frete inteiro; a taxa do cartão sobre o frete fica com a moto (07/11). */
export const valorLiquidoDaMotoExpr = () => sql`GREATEST(${valorLiquidoExpr()} - ${freteDaVendaExpr()}, 0)`
export const valorLiquidoDaMotoSql = (v = 'v') => sql`GREATEST(${valorLiquidoSql(v)} - ${freteDaVendaSql(v)}, 0)`

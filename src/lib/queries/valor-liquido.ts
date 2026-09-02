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

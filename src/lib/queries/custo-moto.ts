import { sql } from 'drizzle-orm'
import { motos, vendas } from '@/lib/db/schema'

/**
 * Custo da moto vendida, com queda para a precificação do grupo.
 *
 * A fonte primária é `motos.preco_compra`, gravado na entrada da nota. Quando a
 * moto entrou sem esse dado (importação antiga, entrada manual apressada), o
 * custo cai para `precificacao.custo` do mesmo modelo no grupo da loja que
 * vendeu — é a informação que o Cesar já mantém em /precificacao, e que estava
 * ali enquanto o financeiro tratava a moto como custo zero.
 *
 * Devolve NULL quando não há custo em lugar nenhum, de propósito: quem soma faz
 * COALESCE, e quem avisa "N motos sem custo" conta os NULLs. Se devolvesse zero,
 * o aviso sumiria e o lucro inflado passaria despercebido.
 *
 * A precificação casa por NOME do modelo (`precificacao.nome = modelos.modelo`),
 * que é como o resto do sistema já faz — ver buscarPrecificacao em vendas/actions.
 * Conferido em 01/09/2026: nenhum nome se repete dentro de um grupo e nenhum
 * modelo existe em duas marcas, então o LIMIT 1 não escolhe entre candidatos.
 *
 * Precisa de `vendas` e `motos` no FROM da consulta que a usa.
 */
export function custoMotoExpr() {
  return sql`COALESCE(
    ${motos.precoCompra}::numeric,
    (SELECT pr.custo::numeric
       FROM precificacao pr
       JOIN modelos md ON md.id = ${sql.raw('"motos"."modelo_id"')}
       JOIN lojas l    ON l.id  = ${sql.raw('"vendas"."loja_id"')}
      WHERE pr.nome = md.modelo
        AND pr.grupo_id = l.grupo_id
        AND pr.ativo
      LIMIT 1)
  )`
}

/** Soma dos custos do recorte, já com a queda para a precificação. */
export function somaCustoMotoExpr() {
  return sql`COALESCE(SUM(${custoMotoExpr()}), 0)`
}

/**
 * Quantas motos do recorte seguem sem custo em lugar nenhum.
 *
 * Conta `vendas.id`, e não `*`: o resumo por loja parte de `lojas` com LEFT JOIN
 * em vendas, e com `COUNT(*)` uma loja que não vendeu nada no mês apareceria com
 * "1 venda sem custo" — a linha existe, a venda não.
 */
export function qtdSemCustoExpr() {
  return sql`COUNT(${vendas.id}) FILTER (WHERE ${custoMotoExpr()} IS NULL)`
}

-- Reajuste de 60% no catálogo de peças: valor × 1,6 arredondado pro real cheio.
-- Pedido do Cesar em 28/08/2026 — o catálogo estava com o preço de custo da fábrica.
--
-- Guarda o preço anterior antes de mexer: são 1.733 linhas e dividir de volta por
-- 1,6 NÃO restaura o original (o arredondamento pro real come o centavo). Desfazer:
--   UPDATE pecas_catalogo c SET valor = b.valor
--   FROM pecas_catalogo_valor_bkp_20260828 b WHERE b.id = c.id;
-- A tabela de backup pode ser apagada quando o preço novo estiver validado no balcão.
--
-- Vendas já fechadas não mudam: vendas_pecas_itens.valor_unitario é snapshot do
-- preço no momento da venda, não uma referência ao catálogo.

DO $$
BEGIN
  -- A existência do backup é o próprio marcador de "já rodou" — rodar duas vezes
  -- aplicaria 1,6 sobre 1,6 (= 2,56×) e ninguém perceberia até o cliente reclamar.
  IF to_regclass('public.pecas_catalogo_valor_bkp_20260828') IS NOT NULL THEN
    RAISE NOTICE 'Reajuste já aplicado (backup existe) — nada a fazer.';
    RETURN;
  END IF;

  CREATE TABLE pecas_catalogo_valor_bkp_20260828 AS
  SELECT id, valor FROM pecas_catalogo;

  -- Peça de centavos (só a "Teste2" de R$ 0,03) arredondaria pra zero e sairia
  -- de graça no balcão — essas ficam como estão.
  UPDATE pecas_catalogo
  SET valor = ROUND(valor * 1.6),
      atualizado_em = now()
  WHERE ROUND(valor * 1.6) >= 1;
END $$;

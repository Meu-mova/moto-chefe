-- Preço de compra das TITAN, LUX e R10 que entraram sem custo. Continuação da
-- 0067, mesma origem: modelo que nunca teve custo cadastrado entra no Financeiro
-- como R$ 0,00 e vira lucro que não existiu.
--
-- Valores informados pelo Cesar em 24/08/2026:
--   TITAN  R$ 7.500,00
--   LUX    R$ 7.000,00
--   R10    R$ 7.500,00
--
-- 11 motos do Sul de Minas: 3 R10 vendidas (uma em julho, duas em agosto) e 8
-- ainda em estoque (5 R10, 2 TITAN, 2 LUX). Agosto fica sem nenhuma venda de
-- custo desconhecido.
--
-- A R10 vendida em BH fica de fora: preço de compra é do cadastro de cada
-- bandeira, que compra por conta própria — ver [[feedback_sempre_separar_grupos]].
-- Se for o mesmo valor, entra numa correção própria.
UPDATE motos m
   SET preco_compra = v.preco
  FROM (VALUES
          ('TITAN', 7500.00),
          ('LUX',   7000.00),
          ('R10',   7500.00)
       ) AS v(modelo, preco)
  JOIN modelos mo ON mo.modelo = v.modelo
 WHERE m.modelo_id = mo.id
   AND m.preco_compra IS NULL
   AND m.loja_id IN (
         SELECT l.id FROM lojas l
           JOIN grupos g ON g.id = l.grupo_id
          WHERE g.nome = 'Sul de Minas'
       );

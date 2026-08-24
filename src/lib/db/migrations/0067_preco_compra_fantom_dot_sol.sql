-- Preço de compra das motos FANTOM, DOT e SOL que entraram sem custo.
--
-- Correção de dado, não de schema. FANTOM e SOL não tinham preço de compra em
-- NENHUMA unidade da base, e a DOT só em uma: essas motos entravam no Financeiro
-- como custo zero, e o "Custo Total (Motos Vendidas)" saía menor do que a
-- realidade — só em agosto/2026 eram 9 vendas de 137 sem custo, ~R$ 51 mil a
-- menos, que viravam lucro que não existiu.
--
-- Valores informados pelo Cesar em 24/08/2026:
--   FANTOM  R$ 5.400,00
--   DOT     R$ 5.700,00
--   SOL     R$ 5.500,00
--
-- São 38 motos, todas do Sul de Minas — 32 já vendidas (fevereiro a agosto) e 6
-- DOT ainda em estoque. Os fechamentos de fev a jul passam a mostrar lucro MENOR
-- do que mostravam antes: é a correção aparecendo, não uma piora do resultado.
--
-- Só preenche o que está vazio. A única DOT que já tinha custo (R$ 5.900) fica
-- como está por decisão do Cesar — se aquele foi o valor pago de fato naquela
-- unidade, sobrescrever trocaria o dado real por uma média.
--
-- Escopo por grupo de propósito: se amanhã BH cadastrar uma FANTOM, o preço dela
-- é problema do cadastro de BH, não desta correção.
UPDATE motos m
   SET preco_compra = v.preco
  FROM (VALUES
          ('FANTOM', 5400.00),
          ('DOT',    5700.00),
          ('SOL',    5500.00)
       ) AS v(modelo, preco)
  JOIN modelos mo ON mo.modelo = v.modelo
 WHERE m.modelo_id = mo.id
   AND m.preco_compra IS NULL
   AND m.loja_id IN (
         SELECT l.id FROM lojas l
           JOIN grupos g ON g.id = l.grupo_id
          WHERE g.nome = 'Sul de Minas'
       );

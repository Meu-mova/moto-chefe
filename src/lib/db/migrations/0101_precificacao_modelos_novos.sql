-- Preenche os modelos que estavam no catálogo (/admin/modelos) mas sem preço em
-- um dos dois grupos. Ficaram invisíveis enquanto /precificacao listava só a
-- tabela precificacao; a lista agora vem do catálogo e eles apareceram.
--
-- Decisão do Cesar em 24/09/2026: copiar custo, valor mínimo e status do grupo
-- irmão, sem ajuste. O custo já batia entre os dois grupos em 41 dos 42 modelos
-- comuns; o mínimo diverge em 9 deles, e mesmo assim ele optou por repetir.
--
-- OUXI fica de fora de propósito: não tem preço em nenhum dos dois grupos, não
-- há de onde copiar.

-- ─── Sul de Minas recebe o que só existia em BH ──────────────────────────────
INSERT INTO precificacao (grupo_id, nome, valor_minimo, custo, ativo,
                          taxa_pix, taxas_cartao, taxas_link, taxas_financiamento)
SELECT (SELECT id FROM grupos WHERE nome = 'Sul de Minas'),
       fonte.nome, fonte.valor_minimo, fonte.custo, fonte.ativo,
       '0', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  FROM precificacao fonte
 WHERE fonte.grupo_id = (SELECT id FROM grupos WHERE nome = 'BH')
   AND fonte.nome IN ('BIKE ELETRICA B2', 'FASHION', 'RIDE', 'X11-12')
   -- Reentrante: rodar duas vezes não duplica a linha.
   AND NOT EXISTS (
         SELECT 1 FROM precificacao p
          WHERE p.grupo_id = (SELECT id FROM grupos WHERE nome = 'Sul de Minas')
            AND upper(btrim(p.nome)) = upper(btrim(fonte.nome)));

-- ─── BH recebe o que só existia no Sul de Minas ──────────────────────────────
INSERT INTO precificacao (grupo_id, nome, valor_minimo, custo, ativo,
                          taxa_pix, taxas_cartao, taxas_link, taxas_financiamento)
SELECT (SELECT id FROM grupos WHERE nome = 'BH'),
       fonte.nome, fonte.valor_minimo, fonte.custo, fonte.ativo,
       '0', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  FROM precificacao fonte
 WHERE fonte.grupo_id = (SELECT id FROM grupos WHERE nome = 'Sul de Minas')
   AND fonte.nome IN ('CALEBITO', 'LUX', 'RAPTOR', 'SUSAN', 'TITAN')
   AND NOT EXISTS (
         SELECT 1 FROM precificacao p
          WHERE p.grupo_id = (SELECT id FROM grupos WHERE nome = 'BH')
            AND upper(btrim(p.nome)) = upper(btrim(fonte.nome)));

-- ─── X11 MINI: custo digitado errado em BH ───────────────────────────────────
-- Era 6870,00 em BH contra 5500,00 no Sul de Minas, com o mesmo mínimo nos dois.
-- Único custo divergente entre os grupos; o Cesar confirmou que 5500 é o certo.
UPDATE precificacao
   SET custo = '5500.00'
 WHERE grupo_id = (SELECT id FROM grupos WHERE nome = 'BH')
   AND nome = 'X11 MINI'
   AND custo = '6870.00';

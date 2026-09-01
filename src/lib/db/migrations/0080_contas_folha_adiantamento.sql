-- 0080_contas_folha_adiantamento.sql
-- Lança as duas contas automáticas da folha, pedidas pelo Cesar em 01/09/2026,
-- para TODOS os grupos ativos (Sul de Minas e BH têm folha própria).
--
--   dia 05 — folha do MÊS ANTERIOR, valor cheio (100% do total a pagar da folha,
--            que já sai líquido dos adiantamentos)
--   dia 20 — adiantamentos do MÊS DA COMPETÊNCIA: o vale do dia 20/09 é o
--            adiantamento lançado em setembro, e é exatamente ele que a folha de
--            setembro (paga em 05/10) desconta. Usar o mês anterior aqui pagaria
--            o vale de agosto duas vezes.
--
-- Vigência a partir de 2026-09: as competências anteriores não são reescritas.
-- Guarda contra rodar duas vezes — a conta é reconhecida pela base da fórmula.
INSERT INTO contas_pagar
  (grupo_id, loja_id, descricao, categoria, tipo, valor, dia_vencimento,
   formula_base, formula_percentual, formula_mes_ref, inicio, ativo, observacao)
SELECT g.id, NULL, 'Folha de pagamento', 'Pessoal', 'automatica', NULL, 5,
       'folha_pagamento', 100, 'anterior', '2026-09', true,
       'Total a pagar da folha do mês anterior, líquido de adiantamentos'
FROM grupos g
WHERE g.ativo = true
  AND NOT EXISTS (
    SELECT 1 FROM contas_pagar c
    WHERE c.grupo_id = g.id AND c.formula_base = 'folha_pagamento'
  );

INSERT INTO contas_pagar
  (grupo_id, loja_id, descricao, categoria, tipo, valor, dia_vencimento,
   formula_base, formula_percentual, formula_mes_ref, inicio, ativo, observacao)
SELECT g.id, NULL, 'Adiantamento salarial', 'Pessoal', 'automatica', NULL, 20,
       'adiantamentos', 100, 'corrente', '2026-09', true,
       'Vale fixo mais adiantamentos avulsos lançados no próprio mês'
FROM grupos g
WHERE g.ativo = true
  AND NOT EXISTS (
    SELECT 1 FROM contas_pagar c
    WHERE c.grupo_id = g.id AND c.formula_base = 'adiantamentos'
  );

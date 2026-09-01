-- 0079_conta_mes_referencia.sql
-- Mês que a conta automática apura.
--
-- Até aqui toda automática olhava o mês ANTERIOR, que é como imposto e folha
-- funcionam: o que se paga em outubro sai do que aconteceu em setembro. O
-- adiantamento quebra a regra — o vale do dia 20 de setembro é o adiantamento
-- lançado em SETEMBRO, e é ele que a folha de setembro (paga em 05/10) desconta.
--
-- 'anterior' como default preserva as contas já cadastradas.
ALTER TABLE contas_pagar
  ADD COLUMN IF NOT EXISTS formula_mes_ref text NOT NULL DEFAULT 'anterior';

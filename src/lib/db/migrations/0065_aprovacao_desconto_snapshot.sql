-- Snapshot do desconto na aprovação de venda abaixo do mínimo.
--
-- Até aqui aprovacoes_venda guardava só o valor bruto e as formas de pagamento.
-- O desconto concedido (quanto o líquido ficou abaixo do valor_minimo do modelo)
-- era um número transitório: existia dentro de solicitarAprovacaoVendaAction, era
-- usado pra decidir se a venda precisava de aprovação, e sumia.
--
-- Isso torna o histórico impossível de reconstruir. Recalcular hoje usa a
-- precificação e as taxas de HOJE, e o preço mínimo muda — vários motivos
-- registrados em julho são literalmente "atualização de tabela". Reprocessando as
-- 43 linhas antigas, duas dão desconto zero ou negativo: a tabela caiu depois da
-- venda, não o vendedor deixou de dar desconto.
--
-- Guardamos os dois lados em vez do desconto pronto. O desconto é derivado na
-- leitura (valor_minimo_snapshot - liquido_snapshot); coluna calculada gravada é
-- coluna que sai de sincronia. Com valor_minimo, líquido e o bruto (que já está em
-- `valor`), o relatório pode medir tanto sacrifício de margem quanto negociação de
-- preço sem precisar de outra migração.
--
-- Só o fluxo de moto preenche isso. Peça e OS abrem aprovação sempre como
-- 'pagamento_sensivel', onde a trava não é sobre preço — lá as três ficam NULL.
--
-- snapshot_estimado marca as linhas do backfill (scripts/backfill-desconto-snapshot.ts),
-- reconstruídas contra a tabela atual. Sem essa flag, daqui a três meses ninguém
-- lembra que o número de julho é uma estimativa.
ALTER TABLE aprovacoes_venda
  ADD COLUMN IF NOT EXISTS valor_minimo_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS liquido_snapshot      numeric(12,2),
  ADD COLUMN IF NOT EXISTS snapshot_estimado     boolean NOT NULL DEFAULT false;

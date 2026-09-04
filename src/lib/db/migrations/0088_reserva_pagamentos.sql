-- Entrada da reserva pode ser dividida em mais de uma forma de pagamento.
-- Mesmo formato de pedidos_venda.pagamentos: [{ tipo, valor, operadora?, parcelas? }].
-- meio_pagamento / cartao_operadora / cartao_parcelas continuam preenchidos com a
-- PRIMEIRA linha — o comprovante, o histórico e queries/motos.ts já leem dali.
alter table reservas add column if not exists pagamentos jsonb;

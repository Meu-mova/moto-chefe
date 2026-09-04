-- O sinal da demanda pode ser dividido em mais de uma forma de pagamento.
-- Mesmo formato de reservas.pagamentos (0088): [{ tipo, valor, operadora?, parcelas? }].
-- meio_pagamento continua preenchido com a PRIMEIRA linha — o recibo impresso lê dali.
alter table demandas add column if not exists pagamentos jsonb;

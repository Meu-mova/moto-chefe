-- Cancelamento da NF de saída (#66). O prazo de 24h conta da autorização na
-- SEFAZ, que a consulta da Nota Gateway devolve e até aqui não era gravada.
-- O motivo é só nosso: a Nota Gateway manda à SEFAZ sempre "Pedido cancelado".
ALTER TABLE notas_fiscais_saida
  ADD COLUMN IF NOT EXISTS data_autorizacao    timestamptz,
  ADD COLUMN IF NOT EXISTS cancelamento_motivo text,
  ADD COLUMN IF NOT EXISTS cancelamento_por    uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS cancelamento_em     timestamptz;

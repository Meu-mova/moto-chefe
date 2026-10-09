-- Tentativa descartada (#88): a nota que ficou em Enviando porque o envio não
-- chegou à Nota Gateway pode virar Descartada, e então deixa de travar a venda.
-- A mesma lista está em src/lib/notagateway/status.ts.
DROP INDEX IF EXISTS notas_fiscais_saida_uma_viva_idx;
CREATE UNIQUE INDEX notas_fiscais_saida_uma_viva_idx
  ON notas_fiscais_saida (venda_id)
  WHERE ambiente = 'Producao' AND status NOT IN ('Negada', 'Denegada', 'Cancelada', 'Descartada');

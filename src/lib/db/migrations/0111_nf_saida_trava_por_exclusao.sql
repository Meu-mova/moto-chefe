-- A trava de uma nota viva por venda (0109) só contava Enviando, Processando e
-- Autorizada. Os status intermediários da Nota Gateway (EmProcessoDeAutorizacao,
-- AutorizadaAguardandoGeracaoPDF etc.) escapavam dela e deixavam emitir uma
-- segunda nota para a mesma venda (#80). Agora é por exclusão: só Negada,
-- Denegada e Cancelada liberam. A mesma lista está em src/lib/notagateway/status.ts.
DROP INDEX IF EXISTS notas_fiscais_saida_uma_viva_idx;
CREATE UNIQUE INDEX notas_fiscais_saida_uma_viva_idx
  ON notas_fiscais_saida (venda_id)
  WHERE ambiente = 'Producao' AND status NOT IN ('Negada', 'Denegada', 'Cancelada');

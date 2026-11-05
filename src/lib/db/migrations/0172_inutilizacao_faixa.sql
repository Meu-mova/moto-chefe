-- Inutilização de faixa (#655): o pedido pode não nascer de uma NF do MOVA (número gasto fora dele).
ALTER TABLE notas_fiscais_saida_inutilizacoes ALTER COLUMN nota_id DROP NOT NULL;

-- A NG limita a 10.000 números por pedido (MOC NF-e, regra I04).
ALTER TABLE notas_fiscais_saida_inutilizacoes
  ADD CONSTRAINT notas_fiscais_saida_inutilizacoes_faixa_check CHECK (numero_final - numero_inicial < 10000);

-- A trava contra dois pedidos do mesmo número vale só para o pedido da nota. Faixa repetida ou
-- sobreposta é aviso na tela, não bloqueio (decisão do Luis, #655); o duplo clique da faixa cai no id_externo único.
DROP INDEX IF EXISTS notas_fiscais_saida_inutilizacoes_numero_idx;
CREATE UNIQUE INDEX notas_fiscais_saida_inutilizacoes_numero_idx
  ON notas_fiscais_saida_inutilizacoes (grupo_id, ambiente, serie, numero_inicial)
  WHERE situacao <> 'negada' AND nota_id IS NOT NULL;

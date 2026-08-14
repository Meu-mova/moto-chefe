-- Recebimento de OS em dinheiro passa a lançar no caixa (como a venda de moto).
-- lancamentos_caixa só tinha vínculo com venda; agora também com a OS, para
-- rastrear e re-sincronizar o lançamento quando o pagamento da OS é editado.
ALTER TABLE lancamentos_caixa
  ADD COLUMN IF NOT EXISTS os_id uuid REFERENCES ordens_servico(id);

CREATE INDEX IF NOT EXISTS idx_lancamentos_caixa_os_id
  ON lancamentos_caixa (os_id);

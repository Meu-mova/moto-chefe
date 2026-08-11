-- Última leitura do portal da fábrica, por loja.
--
-- Sem isso o card do dashboard não consegue distinguir "nenhum pedido
-- aguardando pagamento" de "ninguém conseguiu ler esta conta" — e as duas
-- coisas aparecem como zero. Hoje o Vale não tem credencial nenhuma e duas
-- lojas do Sul de Minas também não, então o card mentiria em 3 das 8 lojas.

CREATE TABLE IF NOT EXISTS fabrica_sync_loja (
  loja_id     uuid PRIMARY KEY REFERENCES lojas(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('ok', 'sem_credencial', 'erro')),
  erro        text,
  pedidos     integer NOT NULL DEFAULT 0,
  executado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE fabrica_sync_loja IS
  'Resultado da última leitura do portal da fábrica por loja — alimenta o card de pedidos aguardando pagamento no dashboard.';

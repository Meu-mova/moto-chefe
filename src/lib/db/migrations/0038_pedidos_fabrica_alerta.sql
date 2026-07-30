-- Controle do alerta de pedido de compras "aguardando pagamento" no portal da fábrica.
-- Uma linha por pedido por grupo: guarda quando avisamos a primeira vez e quando
-- lembramos pela última, pra não repetir o aviso na mesma rodada do cron.
-- resolvido_em preenchido = pedido saiu do status (pago ou cancelado).
CREATE TABLE IF NOT EXISTS pedidos_fabrica_alerta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  numero_pedido text NOT NULL,
  valor numeric(12,2),
  data_pedido text,
  primeiro_alerta_em timestamptz NOT NULL DEFAULT now(),
  ultimo_alerta_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  UNIQUE (grupo_id, numero_pedido)
);

CREATE INDEX IF NOT EXISTS pedidos_fabrica_alerta_pendentes_idx
  ON pedidos_fabrica_alerta (grupo_id) WHERE resolvido_em IS NULL;

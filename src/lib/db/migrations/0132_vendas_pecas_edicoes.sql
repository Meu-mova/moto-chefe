-- Histórico da edição de venda de peças (#242): quem mudou, quando e o quê.
-- A venda é editada no lugar (mesmo número); aqui fica o antes e o depois.
CREATE TABLE IF NOT EXISTS vendas_pecas_edicoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id      uuid NOT NULL REFERENCES grupos(id),
  venda_peca_id uuid NOT NULL REFERENCES vendas_pecas(id) ON DELETE CASCADE,
  usuario_id    uuid NOT NULL REFERENCES usuarios(id),
  resumo        text NOT NULL,
  antes         jsonb NOT NULL,
  depois        jsonb NOT NULL,
  editado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendas_pecas_edicoes_venda_idx ON vendas_pecas_edicoes (venda_peca_id);

-- Sem policy: acesso só pelo servidor (Drizzle).
ALTER TABLE vendas_pecas_edicoes ENABLE ROW LEVEL SECURITY;

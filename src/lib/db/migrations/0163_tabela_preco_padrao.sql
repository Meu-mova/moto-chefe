-- Tabela de preço de venda sugerido da MotoChefe (#522): só o preço à vista por modelo da
-- plataforma, carregada pelo admin_geral por planilha. Não é de nenhuma Conta.
CREATE TABLE IF NOT EXISTS tabela_preco_padrao (
  modelo_id      uuid PRIMARY KEY REFERENCES modelos(id) ON DELETE CASCADE,
  preco          numeric(12, 2) NOT NULL CHECK (preco > 0),
  competencia    text NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),
  carregado_por  uuid REFERENCES usuarios(id),
  carregado_em   timestamptz NOT NULL DEFAULT now()
);

-- Sem policy: acesso só pelo servidor (Drizzle).
ALTER TABLE tabela_preco_padrao ENABLE ROW LEVEL SECURITY;

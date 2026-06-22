-- Módulo de Precificação: taxas por modalidade e parcelamento
CREATE TABLE IF NOT EXISTS precificacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  valor_minimo NUMERIC(12,2) NOT NULL,
  taxa_pix NUMERIC(8,6) NOT NULL DEFAULT 0,
  taxas_cartao JSONB NOT NULL DEFAULT '{}',
  taxas_link JSONB NOT NULL DEFAULT '{}',
  taxas_financiamento JSONB NOT NULL DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE precificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura_global" ON precificacao FOR SELECT USING (true);
CREATE POLICY "admin_escrita" ON precificacao FOR ALL USING (
  (SELECT papel FROM usuarios WHERE id = auth.uid()) IN ('admin_geral', 'admin_socio')
);

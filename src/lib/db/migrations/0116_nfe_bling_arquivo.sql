-- Acervo das NF-e de saída emitidas pelo Bling, guardado no Storage (bucket
-- privado nfe-bling) para o botão DANFE das vendas antigas continuar
-- funcionando depois que a conta do Bling for encerrada.
-- Preenchida por scripts/subir-arquivo-nfe-bling.ts a partir do indice.csv.
CREATE TABLE IF NOT EXISTS nfe_bling_arquivo (
  grupo_id      uuid NOT NULL REFERENCES grupos(id),
  bling_nfe_id  text NOT NULL,
  numero        text NOT NULL,
  serie         text,
  chave         text,
  -- CPF/CNPJ do destinatário: confirma a nota quando a venda só tem o número.
  documento     text,
  data_emissao  date,
  situacao      text NOT NULL,
  xml_path      text,
  pdf_path      text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grupo_id, bling_nfe_id)
);

CREATE INDEX IF NOT EXISTS nfe_bling_arquivo_numero_idx ON nfe_bling_arquivo (grupo_id, documento);

-- Bucket privado: acesso só por service role e URL assinada, como holerites.
INSERT INTO storage.buckets (id, name, public) VALUES ('nfe-bling', 'nfe-bling', false)
ON CONFLICT (id) DO NOTHING;

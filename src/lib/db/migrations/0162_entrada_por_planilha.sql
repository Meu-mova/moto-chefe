-- Entrada de peças por planilha (#519): fica registrada como as notas, sem chave nem
-- número. A impressão digital do conteúdo serve para avisar quando a mesma planilha
-- volta a ser lançada na loja.
ALTER TABLE notas_entrada ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'nota'
  CHECK (origem IN ('nota', 'planilha'));
ALTER TABLE notas_entrada ADD COLUMN IF NOT EXISTS impressao_digital text;
ALTER TABLE notas_entrada ALTER COLUMN chave_acesso DROP NOT NULL;
ALTER TABLE notas_entrada ALTER COLUMN numero DROP NOT NULL;
ALTER TABLE notas_entrada ALTER COLUMN fornecedor_cnpj DROP NOT NULL;
ALTER TABLE notas_entrada ADD CONSTRAINT notas_entrada_origem_campos_check CHECK (
  (origem = 'nota' AND chave_acesso IS NOT NULL AND numero IS NOT NULL AND fornecedor_cnpj IS NOT NULL AND impressao_digital IS NULL)
  OR (origem = 'planilha' AND chave_acesso IS NULL AND numero IS NULL AND impressao_digital IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS notas_entrada_loja_id_impressao_digital_idx ON notas_entrada (loja_id, impressao_digital);

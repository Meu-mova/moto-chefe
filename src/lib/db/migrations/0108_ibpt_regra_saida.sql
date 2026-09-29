-- Lei da Transparencia (12.741/2012): a NF ao consumidor traz o total
-- aproximado de tributos. O Bling preenchia sozinho pela tabela do IBPT; na
-- emissao propria o percentual vem da regra do grupo. Toda moto e NCM
-- 8711.60.00, entao um par federal/estadual por grupo resolve -- a tabela do
-- IBPT muda a cada semestre e quem atualiza e o admin.
ALTER TABLE regras_fiscais_saida
  ADD COLUMN IF NOT EXISTS ibpt_federal  numeric(5,2),
  ADD COLUMN IF NOT EXISTS ibpt_estadual numeric(5,2);

-- Sul de Minas: os percentuais das notas do Bling (NF 2495/2497, set/2026).
UPDATE regras_fiscais_saida
   SET ibpt_federal = 31.60, ibpt_estadual = 12.00
 WHERE grupo_id = '00000000-0000-4000-8000-000000000001'
   AND ibpt_federal IS NULL;

-- Preço da adesão ao MOVA (#165): franqueado MotoChefe tem desconto, e a taxa de
-- implantação vai no contrato. O dia de vencimento deixa de ser digitado (a 1ª
-- mensalidade vence 30 dias após o primeiro acesso); a coluna dia_vencimento da
-- 0118 fica, sem uso por ora, para não misturar drop com a entrega.
ALTER TABLE adesoes_mova
  ADD COLUMN IF NOT EXISTS franqueado_motochefe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS taxa_implantacao numeric(12, 2);

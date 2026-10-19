-- Grupo que a adesão gerou: a mensalidade dele sai dos valores dela (#207).
ALTER TABLE adesoes_mova ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES grupos(id);
CREATE UNIQUE INDEX IF NOT EXISTS adesoes_mova_grupo_id_unico ON adesoes_mova (grupo_id) WHERE grupo_id IS NOT NULL;

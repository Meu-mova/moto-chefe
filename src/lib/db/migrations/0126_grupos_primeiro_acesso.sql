-- 1º acesso do cliente ao sistema: a 1ª mensalidade vence 30 dias depois (#207).
ALTER TABLE grupos ADD COLUMN IF NOT EXISTS primeiro_acesso_em timestamptz;

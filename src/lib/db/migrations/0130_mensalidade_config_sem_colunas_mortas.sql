-- O vínculo com a adesão já é adesoes_mova.grupo_id (0127), e o bloqueio é calculado na hora
-- a partir das mensalidades em aberto: estas colunas da 0128 nunca foram usadas.
ALTER TABLE mensalidade_config DROP COLUMN IF EXISTS adesao_id;
ALTER TABLE mensalidade_config DROP COLUMN IF EXISTS status;
ALTER TABLE mensalidade_config DROP COLUMN IF EXISTS bloqueia_em;

-- Dados do contrato de adesão ao MOVA (#165). O /adesao coleta só o mínimo
-- (pedido do Cesar); o operador da MOVA completa o resto na tela /admin/adesoes.
-- Tudo nulo: as adesões já recebidas não têm nada disso.
ALTER TABLE adesoes_mova
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS endereco_sede text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS responsavel_cpf text,
  ADD COLUMN IF NOT EXISTS valor_mensal numeric(12, 2),
  ADD COLUMN IF NOT EXISTS dia_vencimento integer,
  ADD COLUMN IF NOT EXISTS motivo_recusa text,
  ADD COLUMN IF NOT EXISTS recusada_em timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_recusa text,
  ADD COLUMN IF NOT EXISTS atualizado_por uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz;

ALTER TABLE adesoes_mova DROP CONSTRAINT IF EXISTS adesoes_mova_status_check;
-- 'processada' vem do comentário da 0115; nenhum código grava, mas uma linha
-- alterada à mão com ele faria esta migração falhar na produção.
ALTER TABLE adesoes_mova ADD CONSTRAINT adesoes_mova_status_check
  CHECK (status IN ('pendente', 'dados_completos', 'recusada', 'processada'));

ALTER TABLE adesoes_mova DROP CONSTRAINT IF EXISTS adesoes_mova_dia_vencimento_check;
ALTER TABLE adesoes_mova ADD CONSTRAINT adesoes_mova_dia_vencimento_check
  CHECK (dia_vencimento BETWEEN 1 AND 28);

-- Resultado do WhatsApp da recusa ('enviado' | 'sem_numero' | 'erro'): sem ele,
-- um aviso que não saiu só ficaria num toast que some.
ALTER TABLE adesoes_mova DROP CONSTRAINT IF EXISTS adesoes_mova_aviso_recusa_check;
ALTER TABLE adesoes_mova ADD CONSTRAINT adesoes_mova_aviso_recusa_check
  CHECK (aviso_recusa IN ('enviado', 'sem_numero', 'erro'));

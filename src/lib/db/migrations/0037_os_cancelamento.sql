-- Cancelamento de OS (soft delete com motivo).
-- Só OS sem pagamento lançado e sem conciliação pode ser cancelada — não existe
-- estorno de caixa neste sistema, então dinheiro já lançado bloqueia o cancelamento.
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'cancelada';
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS motivo_cancelamento text;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS cancelada_em timestamptz;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS cancelada_por uuid REFERENCES usuarios(id);

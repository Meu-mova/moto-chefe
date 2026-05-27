-- Execute este arquivo no Supabase SQL Editor APÓS aplicar a migration Drizzle

-- Habilitar pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Apenas um pedido pendente por moto
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_venda_moto_pendente_idx
  ON pedidos_venda (moto_id)
  WHERE status = 'pendente';

-- Apenas uma transferência pendente por moto
CREATE UNIQUE INDEX IF NOT EXISTS transferencias_moto_pendente_idx
  ON transferencias (moto_id)
  WHERE status = 'pendente';

-- Apenas uma garantia ativa por moto
CREATE UNIQUE INDEX IF NOT EXISTS garantias_moto_ativa_idx
  ON garantias (moto_id)
  WHERE status = 'ativa';

-- Validação data_fim > data_inicio em garantias
ALTER TABLE garantias
  ADD CONSTRAINT garantias_data_fim_check
  CHECK (data_fim > data_inicio);

-- View vendas_seguras com mascaramento de CPF por papel
-- (Será substituída por versão com decrypt no Plano 2 após configurar a chave pgcrypto)
CREATE OR REPLACE VIEW vendas_seguras AS
SELECT
  id, pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por,
  cliente_nome,
  CASE
    WHEN current_setting('request.jwt.claims', true)::jsonb->>'papel'
      IN ('admin_geral', 'aux_adm')
    THEN cliente_cpf
    ELSE '***.***.***-**'
  END AS cliente_cpf,
  valor, forma_pagamento, data_venda
FROM vendas;

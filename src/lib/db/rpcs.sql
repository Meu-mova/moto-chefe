-- Execute este arquivo no Supabase SQL Editor

-- RPC: Mudança atômica de status de moto
CREATE OR REPLACE FUNCTION mudar_status_moto(
  p_moto_id uuid,
  p_novo_status moto_status,
  p_usuario_id uuid,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status_atual moto_status;
BEGIN
  SELECT status INTO v_status_atual
  FROM motos
  WHERE id = p_moto_id
  FOR UPDATE;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Moto não encontrada';
  END IF;

  UPDATE motos SET status = p_novo_status WHERE id = p_moto_id;

  INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
  VALUES (p_moto_id, p_usuario_id, 'mudanca_status', v_status_atual, p_novo_status, p_observacao);
END;
$$;

-- RPC: Criar pedido de venda (com lock)
CREATE OR REPLACE FUNCTION criar_pedido_venda(
  p_moto_id uuid,
  p_loja_id uuid,
  p_vendedor_id uuid,
  p_observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status moto_status;
  v_pedido_id uuid;
BEGIN
  SELECT status INTO v_status FROM motos WHERE id = p_moto_id FOR UPDATE;

  IF v_status != 'disponivel' THEN
    RAISE EXCEPTION 'Moto não está disponível (status: %)', v_status;
  END IF;

  IF EXISTS (SELECT 1 FROM transferencias WHERE moto_id = p_moto_id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Moto tem transferência pendente';
  END IF;

  UPDATE motos SET status = 'reservada' WHERE id = p_moto_id;

  INSERT INTO pedidos_venda (moto_id, loja_id, vendedor_id, status, observacao)
  VALUES (p_moto_id, p_loja_id, p_vendedor_id, 'pendente', p_observacao)
  RETURNING id INTO v_pedido_id;

  INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, referencia_tipo, referencia_id)
  VALUES (p_moto_id, p_vendedor_id, 'mudanca_status', 'disponivel', 'reservada', 'pedido_venda', v_pedido_id);

  RETURN v_pedido_id;
END;
$$;

-- RPC: Solicitar transferência
CREATE OR REPLACE FUNCTION solicitar_transferencia(
  p_moto_id uuid,
  p_loja_destino_id uuid,
  p_solicitado_por uuid,
  p_observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status moto_status;
  v_loja_origem_id uuid;
  v_transferencia_id uuid;
BEGIN
  SELECT status, loja_id INTO v_status, v_loja_origem_id
  FROM motos WHERE id = p_moto_id FOR UPDATE;

  IF v_status NOT IN ('disponivel', 'montada') THEN
    RAISE EXCEPTION 'Transferência não permitida para moto com status "%"', v_status;
  END IF;

  IF EXISTS (SELECT 1 FROM transferencias WHERE moto_id = p_moto_id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Moto já possui transferência pendente';
  END IF;

  IF EXISTS (SELECT 1 FROM pedidos_venda WHERE moto_id = p_moto_id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Moto possui pedido de venda pendente';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ordens_servico
    WHERE moto_id = p_moto_id AND status IN ('aberta', 'em_andamento')
  ) THEN
    RAISE EXCEPTION 'Moto possui ordem de serviço em aberto';
  END IF;

  INSERT INTO transferencias (moto_id, loja_origem_id, loja_destino_id, solicitado_por, status, observacao)
  VALUES (p_moto_id, v_loja_origem_id, p_loja_destino_id, p_solicitado_por, 'pendente', p_observacao)
  RETURNING id INTO v_transferencia_id;

  RETURN v_transferencia_id;
END;
$$;

-- RPC: Aceitar transferência
CREATE OR REPLACE FUNCTION aceitar_transferencia(
  p_transferencia_id uuid,
  p_respondido_por uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_id uuid;
  v_loja_origem_id uuid;
  v_loja_destino_id uuid;
  v_status_transferencia transferencia_status;
BEGIN
  SELECT moto_id, loja_origem_id, loja_destino_id, status
  INTO v_moto_id, v_loja_origem_id, v_loja_destino_id, v_status_transferencia
  FROM transferencias WHERE id = p_transferencia_id FOR UPDATE;

  IF v_status_transferencia != 'pendente' THEN
    RAISE EXCEPTION 'Transferência não está pendente (status: %)', v_status_transferencia;
  END IF;

  PERFORM id FROM motos WHERE id = v_moto_id FOR UPDATE;

  UPDATE motos SET loja_id = v_loja_destino_id WHERE id = v_moto_id;

  UPDATE transferencias
  SET status = 'aceita', respondido_por = p_respondido_por, data_resposta = now()
  WHERE id = p_transferencia_id;

  INSERT INTO historico_estoque (moto_id, loja_origem_id, loja_destino_id, usuario_id, tipo, referencia_tipo, referencia_id)
  VALUES
    (v_moto_id, v_loja_origem_id, v_loja_destino_id, p_respondido_por, 'transferencia_enviada', 'transferencia', p_transferencia_id),
    (v_moto_id, v_loja_origem_id, v_loja_destino_id, p_respondido_por, 'transferencia_recebida', 'transferencia', p_transferencia_id);
END;
$$;

-- RPC: Recusar transferência
CREATE OR REPLACE FUNCTION recusar_transferencia(
  p_transferencia_id uuid,
  p_respondido_por uuid,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status_transferencia transferencia_status;
BEGIN
  SELECT status INTO v_status_transferencia
  FROM transferencias WHERE id = p_transferencia_id FOR UPDATE;

  IF v_status_transferencia != 'pendente' THEN
    RAISE EXCEPTION 'Transferência não está pendente (status: %)', v_status_transferencia;
  END IF;

  UPDATE transferencias
  SET status = 'recusada',
      respondido_por = p_respondido_por,
      data_resposta = now(),
      observacao = COALESCE(p_observacao, observacao)
  WHERE id = p_transferencia_id;
END;
$$;

-- RPC: Cancelar pedido de venda
CREATE OR REPLACE FUNCTION cancelar_pedido_venda(
  p_pedido_id uuid,
  p_usuario_id uuid,
  p_papel text,
  p_loja_usuario_id uuid,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_id uuid;
  v_loja_id uuid;
  v_vendedor_id uuid;
  v_status pedido_status;
  v_moto_loja_id uuid;
BEGIN
  SELECT moto_id, loja_id, vendedor_id, status
  INTO v_moto_id, v_loja_id, v_vendedor_id, v_status
  FROM pedidos_venda WHERE id = p_pedido_id FOR UPDATE;

  IF v_status != 'pendente' THEN
    RAISE EXCEPTION 'Pedido não está pendente (status: %)', v_status;
  END IF;

  SELECT loja_id INTO v_moto_loja_id
  FROM motos WHERE id = v_moto_id FOR UPDATE;

  IF p_papel = 'admin_geral' THEN
    NULL;
  ELSIF p_papel = 'aux_adm' AND p_loja_usuario_id = v_loja_id THEN
    NULL;
  ELSIF p_papel = 'vendedor' AND p_usuario_id = v_vendedor_id AND p_loja_usuario_id = v_moto_loja_id THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Sem permissão para cancelar este pedido';
  END IF;

  UPDATE pedidos_venda
  SET status = 'cancelado', data_atualizacao = now(),
      observacao = COALESCE(p_observacao, observacao)
  WHERE id = p_pedido_id;

  UPDATE motos SET status = 'disponivel' WHERE id = v_moto_id;

  INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, referencia_tipo, referencia_id, observacao)
  VALUES (v_moto_id, p_usuario_id, 'mudanca_status', 'reservada', 'disponivel', 'pedido_venda', p_pedido_id, p_observacao);
END;
$$;

-- RPC: Efetivar venda (com pgcrypto)
CREATE OR REPLACE FUNCTION efetivar_venda(
  p_pedido_id uuid,
  p_efetivado_por uuid,
  p_cliente_nome text,
  p_cliente_cpf text,
  p_valor numeric,
  p_forma_pagamento text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_id uuid;
  v_loja_id uuid;
  v_vendedor_id uuid;
  v_status pedido_status;
  v_venda_id uuid;
  v_chave text;
BEGIN
  SELECT moto_id, loja_id, vendedor_id, status
  INTO v_moto_id, v_loja_id, v_vendedor_id, v_status
  FROM pedidos_venda WHERE id = p_pedido_id FOR UPDATE;

  IF v_status != 'pendente' THEN
    RAISE EXCEPTION 'Pedido não está pendente (status: %)', v_status;
  END IF;

  PERFORM id FROM motos WHERE id = v_moto_id FOR UPDATE;

  v_chave := current_setting('app.encryption_key', true);
  IF v_chave IS NULL OR v_chave = '' THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada';
  END IF;

  INSERT INTO vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por,
    cliente_nome, cliente_cpf, valor, forma_pagamento, data_venda)
  VALUES (p_pedido_id, v_moto_id, v_loja_id, v_vendedor_id, p_efetivado_por,
    pgp_sym_encrypt(p_cliente_nome, v_chave),
    pgp_sym_encrypt(p_cliente_cpf, v_chave),
    p_valor, p_forma_pagamento, now())
  RETURNING id INTO v_venda_id;

  UPDATE pedidos_venda SET status = 'efetivado', data_atualizacao = now() WHERE id = p_pedido_id;
  UPDATE motos SET status = 'vendida' WHERE id = v_moto_id;

  INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, referencia_tipo, referencia_id)
  VALUES (v_moto_id, p_efetivado_por, 'mudanca_status', 'reservada', 'vendida', 'pedido_venda', p_pedido_id);

  RETURN v_venda_id;
END;
$$;

-- RPC: Abrir OS
CREATE OR REPLACE FUNCTION abrir_ordem_servico(
  p_moto_id uuid,
  p_loja_id uuid,
  p_aberta_por uuid,
  p_mecanico_id uuid,
  p_descricao text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_loja_id uuid;
  v_os_id uuid;
BEGIN
  SELECT loja_id INTO v_moto_loja_id FROM motos WHERE id = p_moto_id FOR UPDATE;

  IF v_moto_loja_id IS NULL THEN
    RAISE EXCEPTION 'Moto não encontrada';
  END IF;

  IF v_moto_loja_id != p_loja_id THEN
    RAISE EXCEPTION 'Moto não pertence à loja do usuário';
  END IF;

  INSERT INTO ordens_servico (moto_id, loja_id, aberta_por, mecanico_id, status, descricao)
  VALUES (p_moto_id, p_loja_id, p_aberta_por, p_mecanico_id, 'aberta', p_descricao)
  RETURNING id INTO v_os_id;

  RETURN v_os_id;
END;
$$;

-- RPC: Atualizar status de OS
CREATE OR REPLACE FUNCTION atualizar_status_os(
  p_os_id uuid,
  p_novo_status os_status,
  p_usuario_id uuid,
  p_papel text,
  p_loja_usuario_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loja_os_id uuid;
  v_status_atual os_status;
BEGIN
  SELECT loja_id, status INTO v_loja_os_id, v_status_atual
  FROM ordens_servico WHERE id = p_os_id FOR UPDATE;

  IF v_loja_os_id IS NULL THEN
    RAISE EXCEPTION 'OS não encontrada';
  END IF;

  IF p_papel != 'admin_geral' AND v_loja_os_id != p_loja_usuario_id THEN
    RAISE EXCEPTION 'Sem permissão para atualizar esta OS';
  END IF;

  IF v_status_atual = 'concluida' THEN
    RAISE EXCEPTION 'OS já concluída não pode ser alterada';
  END IF;

  UPDATE ordens_servico
  SET status = p_novo_status,
      data_conclusao = CASE WHEN p_novo_status = 'concluida' THEN now() ELSE NULL END
  WHERE id = p_os_id;
END;
$$;

-- RPC: Abrir garantia
CREATE OR REPLACE FUNCTION abrir_garantia(
  p_moto_id uuid,
  p_loja_id uuid,
  p_aberta_por uuid,
  p_os_id uuid,
  p_descricao text,
  p_data_inicio date,
  p_data_fim date,
  p_data_pedido_peca date DEFAULT NULL,
  p_numero_pedido_fabrica text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_loja_id uuid;
  v_moto_status moto_status;
  v_garantia_id uuid;
BEGIN
  IF p_data_fim <= p_data_inicio THEN
    RAISE EXCEPTION 'data_fim deve ser maior que data_inicio';
  END IF;

  SELECT loja_id, status INTO v_moto_loja_id, v_moto_status
  FROM motos WHERE id = p_moto_id FOR UPDATE;

  IF v_moto_loja_id != p_loja_id THEN
    RAISE EXCEPTION 'Moto não pertence à loja do usuário';
  END IF;

  IF v_moto_status NOT IN ('faturada', 'montada', 'disponivel', 'em_garantia') THEN
    RAISE EXCEPTION 'Garantia não pode ser aberta para moto com status "%"', v_moto_status;
  END IF;

  INSERT INTO garantias (moto_id, loja_id, os_id, descricao, data_inicio, data_fim, status, data_pedido_peca, numero_pedido_fabrica)
  VALUES (p_moto_id, p_loja_id, p_os_id, p_descricao, p_data_inicio, p_data_fim, 'ativa', p_data_pedido_peca, p_numero_pedido_fabrica)
  RETURNING id INTO v_garantia_id;

  IF v_moto_status != 'em_garantia' THEN
    UPDATE motos SET status = 'em_garantia' WHERE id = p_moto_id;
    INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo)
    VALUES (p_moto_id, p_aberta_por, 'mudanca_status', v_moto_status, 'em_garantia');
  END IF;

  RETURN v_garantia_id;
END;
$$;

-- RPC: Encerrar garantia
CREATE OR REPLACE FUNCTION encerrar_garantia(
  p_garantia_id uuid,
  p_usuario_id uuid,
  p_papel text,
  p_loja_usuario_id uuid,
  p_observacao text DEFAULT NULL,
  p_data_encerramento date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_id uuid;
  v_loja_garantia_id uuid;
  v_os_id uuid;
  v_os_status os_status;
  v_garantia_status garantia_status;
  v_data_real date;
BEGIN
  SELECT moto_id, loja_id, os_id, status
  INTO v_moto_id, v_loja_garantia_id, v_os_id, v_garantia_status
  FROM garantias WHERE id = p_garantia_id FOR UPDATE;

  IF v_garantia_status != 'ativa' THEN
    RAISE EXCEPTION 'Garantia não está ativa';
  END IF;

  IF p_papel != 'admin_geral' AND v_loja_garantia_id != p_loja_usuario_id THEN
    RAISE EXCEPTION 'Sem permissão para encerrar esta garantia';
  END IF;

  IF p_papel != 'admin_geral' AND v_os_id IS NOT NULL THEN
    SELECT status INTO v_os_status FROM ordens_servico WHERE id = v_os_id;
    IF v_os_status != 'concluida' THEN
      RAISE EXCEPTION 'A OS vinculada deve estar concluída antes de encerrar a garantia';
    END IF;
  END IF;

  v_data_real := COALESCE(p_data_encerramento, CURRENT_DATE);

  PERFORM id FROM motos WHERE id = v_moto_id FOR UPDATE;

  UPDATE garantias
  SET status = 'encerrada', data_encerramento = v_data_real
  WHERE id = p_garantia_id;

  -- Só volta para disponível se não houver outras garantias ativas nesta moto
  IF NOT EXISTS (
    SELECT 1 FROM garantias
    WHERE moto_id = v_moto_id AND status = 'ativa' AND id != p_garantia_id
  ) THEN
    UPDATE motos SET status = 'disponivel' WHERE id = v_moto_id;

    INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
    VALUES (v_moto_id, p_usuario_id, 'mudanca_status', 'em_garantia', 'disponivel', p_observacao);
  END IF;
END;
$$;

-- Função de expiração automática de garantias (chamada pelo pg_cron)
CREATE OR REPLACE FUNCTION expirar_garantias()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_garantia RECORD;
BEGIN
  FOR v_garantia IN
    SELECT g.id, g.moto_id
    FROM garantias g
    WHERE g.status = 'ativa' AND g.data_fim < CURRENT_DATE
  LOOP
    PERFORM id FROM motos WHERE id = v_garantia.moto_id FOR UPDATE;

    UPDATE garantias
    SET status = 'encerrada', data_encerramento = CURRENT_DATE
    WHERE id = v_garantia.id;

    -- Só volta para disponível se não houver outras garantias ativas
    IF NOT EXISTS (
      SELECT 1 FROM garantias
      WHERE moto_id = v_garantia.moto_id AND status = 'ativa' AND id != v_garantia.id
    ) THEN
      UPDATE motos SET status = 'disponivel' WHERE id = v_garantia.moto_id;
    END IF;

    INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
    SELECT v_garantia.moto_id, u.id, 'mudanca_status', 'em_garantia', 'disponivel',
           'Encerramento automático por expiração de data_fim'
    FROM usuarios u WHERE u.papel = 'admin_geral' LIMIT 1;
  END LOOP;
END;
$$;

-- Agendar expiração diária às 03:00 (executar apenas se pg_cron estiver habilitado no Supabase)
-- SELECT cron.schedule('expirar-garantias-diario', '0 3 * * *', 'SELECT expirar_garantias()');

-- Chave de criptografia (executar após configurar o valor seguro)
-- ALTER DATABASE postgres SET app.encryption_key = 'sua-chave-secreta-forte-aqui';

-- View vendas_seguras com decrypt (executar APÓS configurar app.encryption_key)
-- CREATE OR REPLACE VIEW vendas_seguras AS
-- SELECT
--   v.id, v.pedido_venda_id, v.moto_id, v.loja_id, v.vendedor_id, v.efetivado_por,
--   pgp_sym_decrypt(v.cliente_nome::bytea, current_setting('app.encryption_key', true)) AS cliente_nome,
--   CASE
--     WHEN (current_setting('request.jwt.claims', true)::jsonb->>'papel') IN ('admin_geral', 'aux_adm')
--     THEN pgp_sym_decrypt(v.cliente_cpf::bytea, current_setting('app.encryption_key', true))
--     ELSE '***.***.***-**'
--   END AS cliente_cpf,
--   v.valor, v.forma_pagamento, v.data_venda
-- FROM vendas v;

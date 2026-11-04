-- Baixa da garantia devolve a moto ao estado certo. As funções gravavam status = 'disponivel',
-- que não é status físico: o estoque mostrava a moto como "Caixa", e a disponibilidade ficava
-- como estava (nula, em moto sem venda). Vale para a baixa manual e para a expiração por data.
-- Número 0175: a 0172, a 0173 e a 0174 estão em outras branches.

-- Regra num lugar só. Quem chama já travou a moto e já viu que não há outra garantia ativa.
-- Com venda: volta para vendida, e a disponibilidade fica (nula até a NF ser registrada).
-- Sem venda: volta para montada, e só vira disponível se não estiver reservada, aguardando
-- aprovação ou marcada como vendida. Veículo só de garantia nunca vira estoque.
CREATE OR REPLACE FUNCTION moto_sai_da_garantia(p_moto_id uuid)
RETURNS moto_status
LANGUAGE plpgsql
AS $$
DECLARE
  v_status moto_status;
BEGIN
  IF EXISTS (SELECT 1 FROM vendas WHERE moto_id = p_moto_id) THEN
    v_status := 'vendida';
    UPDATE motos SET status = v_status WHERE id = p_moto_id;
  ELSE
    v_status := 'montada';
    UPDATE motos
    SET status = v_status,
        disponibilidade = CASE
          WHEN somente_garantia THEN disponibilidade
          WHEN disponibilidade IN ('reservada', 'aguardando_aprovacao', 'vendida') THEN disponibilidade
          ELSE 'disponivel'
        END
    WHERE id = p_moto_id;
  END IF;
  RETURN v_status;
END;
$$;

-- Função interna: não é chamada pela API.
REVOKE ALL ON FUNCTION moto_sai_da_garantia(uuid) FROM PUBLIC;

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
  v_status_anterior moto_status;
  v_status_novo moto_status;
BEGIN
  SELECT moto_id, loja_id, os_id, status
  INTO v_moto_id, v_loja_garantia_id, v_os_id, v_garantia_status
  FROM garantias WHERE id = p_garantia_id FOR UPDATE;

  IF v_garantia_status != 'ativa' THEN
    RAISE EXCEPTION 'Garantia não está ativa';
  END IF;

  IF p_papel NOT IN ('admin_geral', 'admin_socio', 'aux_adm') AND v_loja_garantia_id != p_loja_usuario_id THEN
    RAISE EXCEPTION 'Sem permissão para encerrar esta garantia';
  END IF;

  IF p_papel NOT IN ('admin_geral', 'admin_socio', 'aux_adm') AND v_os_id IS NOT NULL THEN
    SELECT status INTO v_os_status FROM ordens_servico WHERE id = v_os_id;
    IF v_os_status != 'concluida' THEN
      RAISE EXCEPTION 'A OS vinculada deve estar concluída antes de encerrar a garantia';
    END IF;
  END IF;

  v_data_real := COALESCE(p_data_encerramento, CURRENT_DATE);

  SELECT status INTO v_status_anterior FROM motos WHERE id = v_moto_id FOR UPDATE;

  -- Guarda quem encerrou e a observação na própria garantia: é o que o comprovante
  -- imprime, e historico_estoque só recebe a observação quando a moto sai da garantia.
  UPDATE garantias
  SET status = 'encerrada',
      data_encerramento = v_data_real,
      observacao_encerramento = p_observacao,
      encerrada_por = p_usuario_id,
      encerrada_em = now()
  WHERE id = p_garantia_id;

  IF NOT EXISTS (
    SELECT 1 FROM garantias
    WHERE moto_id = v_moto_id AND status = 'ativa' AND id != p_garantia_id
  ) THEN
    v_status_novo := moto_sai_da_garantia(v_moto_id);

    INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
    VALUES (v_moto_id, p_usuario_id, 'mudanca_status', v_status_anterior, v_status_novo, p_observacao);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION expirar_garantias()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_garantia RECORD;
  v_status_anterior moto_status;
  v_status_novo moto_status;
BEGIN
  FOR v_garantia IN
    SELECT g.id, g.moto_id
    FROM garantias g
    WHERE g.status = 'ativa' AND g.data_fim < CURRENT_DATE
  LOOP
    SELECT status INTO v_status_anterior FROM motos WHERE id = v_garantia.moto_id FOR UPDATE;

    UPDATE garantias
    SET status = 'encerrada', data_encerramento = CURRENT_DATE
    WHERE id = v_garantia.id;

    IF NOT EXISTS (
      SELECT 1 FROM garantias
      WHERE moto_id = v_garantia.moto_id AND status = 'ativa' AND id != v_garantia.id
    ) THEN
      v_status_novo := moto_sai_da_garantia(v_garantia.moto_id);

      INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
      SELECT v_garantia.moto_id, u.id, 'mudanca_status', v_status_anterior, v_status_novo,
             'Encerramento automático por expiração de data_fim'
      FROM usuarios u WHERE u.papel = 'admin_geral' LIMIT 1;
    END IF;
  END LOOP;
END;
$$;

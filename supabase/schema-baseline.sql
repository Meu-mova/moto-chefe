-- Baseline do schema `public` da produção (Supabase "Estoque Chassi"), base do staging.
-- Gerado em 2026-10-05 com pg_dump 17.11: --schema-only --no-owner --no-privileges --schema=public.
-- Congelado: nunca re-dumpar; toda mudança depois disto é migração (D2 do plano de staging).
-- Removidos à mão: CREATE/COMMENT ON SCHEMA public (já existe no projeto novo) e \restrict/\unrestrict
-- (meta-comandos do psql que quebram a aplicação por driver). O schema `crm` ficou de fora por decisão.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: aprovacao_venda_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.aprovacao_venda_status AS ENUM (
    'pendente',
    'aprovada',
    'recusada'
);


--
-- Name: aprovacao_venda_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.aprovacao_venda_tipo AS ENUM (
    'valor_minimo',
    'pagamento_sensivel'
);


--
-- Name: calendario_recorrencia; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendario_recorrencia AS ENUM (
    'nenhuma',
    'anual',
    'mensal'
);


--
-- Name: calendario_visibilidade; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendario_visibilidade AS ENUM (
    'grupo',
    'loja',
    'socios',
    'gestao',
    'usuarios'
);


--
-- Name: categoria; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.categoria AS ENUM (
    'autopropelido',
    'ciclomotor',
    'triciclo',
    'bike',
    'brinquedo',
    'patinete'
);


--
-- Name: demanda_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.demanda_status AS ENUM (
    'aberta',
    'atendida'
);


--
-- Name: disponibilidade_moto; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.disponibilidade_moto AS ENUM (
    'disponivel',
    'reservada',
    'vendida',
    'aguardando_aprovacao'
);


--
-- Name: garantia_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.garantia_status AS ENUM (
    'ativa',
    'encerrada'
);


--
-- Name: historico_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.historico_tipo AS ENUM (
    'entrada',
    'saida',
    'transferencia_enviada',
    'transferencia_recebida',
    'mudanca_status'
);


--
-- Name: moto_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.moto_status AS ENUM (
    'faturada',
    'montada',
    'disponivel',
    'reservada',
    'em_garantia',
    'vendida',
    'caixa'
);


--
-- Name: os_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.os_status AS ENUM (
    'aberta',
    'oficina',
    'em_andamento',
    'finalizada',
    'pendente_pagamento',
    'concluida',
    'cancelada'
);


--
-- Name: papel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.papel AS ENUM (
    'admin_geral',
    'aux_adm',
    'vendedor',
    'mecanico',
    'admin_socio',
    'motorista'
);


--
-- Name: pedido_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pedido_status AS ENUM (
    'pendente',
    'efetivado',
    'cancelado'
);


--
-- Name: referencia_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.referencia_tipo AS ENUM (
    'transferencia',
    'pedido_venda',
    'aprovacao_venda'
);


--
-- Name: reserva_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reserva_status AS ENUM (
    'ativa',
    'convertida',
    'cancelada'
);


--
-- Name: sexo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sexo AS ENUM (
    'masculino',
    'feminino',
    'nao_identificado'
);


--
-- Name: tipo_correspondencia_pix; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_correspondencia_pix AS ENUM (
    'venda',
    'os',
    'pedido',
    'peca'
);


--
-- Name: tipo_lancamento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_lancamento AS ENUM (
    'entrada',
    'saida'
);


--
-- Name: tipo_pessoa; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_pessoa AS ENUM (
    'fisica',
    'juridica'
);


--
-- Name: transferencia_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transferencia_status AS ENUM (
    'pendente',
    'aceita',
    'recusada'
);


--
-- Name: abrir_garantia(uuid, uuid, uuid, uuid, text, date, date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.abrir_garantia(p_moto_id uuid, p_loja_id uuid, p_aberta_por uuid, p_os_id uuid, p_descricao text, p_data_inicio date, p_data_fim date, p_data_pedido_peca date DEFAULT NULL::date, p_numero_pedido_fabrica text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
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

  IF v_moto_status NOT IN ('faturada', 'montada', 'disponivel', 'em_garantia', 'vendida') THEN
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


--
-- Name: abrir_ordem_servico(uuid, uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.abrir_ordem_servico(p_moto_id uuid, p_loja_id uuid, p_aberta_por uuid, p_mecanico_id uuid, p_descricao text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: aceitar_transferencia(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aceitar_transferencia(p_transferencia_id uuid, p_respondido_por uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: atualizar_status_os(uuid, public.os_status, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_status_os(p_os_id uuid, p_novo_status public.os_status, p_usuario_id uuid, p_papel text, p_loja_usuario_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: cancelar_pedido_venda(uuid, uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancelar_pedido_venda(p_pedido_id uuid, p_usuario_id uuid, p_papel text, p_loja_usuario_id uuid, p_observacao text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: criar_pedido_venda(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_pedido_venda(p_moto_id uuid, p_loja_id uuid, p_vendedor_id uuid, p_observacao text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: efetivar_venda(uuid, uuid, text, text, numeric, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.efetivar_venda(p_pedido_id uuid, p_efetivado_por uuid, p_cliente_nome text, p_cliente_cpf text, p_valor numeric, p_forma_pagamento text, p_origem_id uuid DEFAULT NULL::uuid, p_origem_detalhe text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
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
    cliente_nome, cliente_cpf, valor, forma_pagamento, data_venda,
    origem_id, origem_detalhe)
  VALUES (p_pedido_id, v_moto_id, v_loja_id, v_vendedor_id, p_efetivado_por,
    pgp_sym_encrypt(p_cliente_nome, v_chave),
    pgp_sym_encrypt(p_cliente_cpf, v_chave),
    p_valor, p_forma_pagamento, now(),
    p_origem_id, nullif(trim(coalesce(p_origem_detalhe, '')), ''))
  RETURNING id INTO v_venda_id;

  UPDATE pedidos_venda SET status = 'efetivado', data_atualizacao = now() WHERE id = p_pedido_id;
  UPDATE motos SET status = 'vendida' WHERE id = v_moto_id;

  INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, referencia_tipo, referencia_id)
  VALUES (v_moto_id, p_efetivado_por, 'mudanca_status', 'reservada', 'vendida', 'pedido_venda', p_pedido_id);

  RETURN v_venda_id;
END;
$$;


--
-- Name: encerrar_garantia(uuid, uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encerrar_garantia(p_garantia_id uuid, p_usuario_id uuid, p_papel text, p_loja_usuario_id uuid, p_observacao text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_moto_id uuid;
  v_loja_garantia_id uuid;
  v_os_id uuid;
  v_os_status os_status;
  v_garantia_status garantia_status;
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

  PERFORM id FROM motos WHERE id = v_moto_id FOR UPDATE;

  UPDATE garantias SET status = 'encerrada' WHERE id = p_garantia_id;

  -- Retorna para montada (disponível para venda novamente)
  UPDATE motos
  SET status = 'montada', disponibilidade = 'disponivel'
  WHERE id = v_moto_id;

  INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
  VALUES (v_moto_id, p_usuario_id, 'mudanca_status', 'em_garantia', 'montada', p_observacao);
END;
$$;


--
-- Name: encerrar_garantia(uuid, uuid, text, uuid, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encerrar_garantia(p_garantia_id uuid, p_usuario_id uuid, p_papel text, p_loja_usuario_id uuid, p_observacao text DEFAULT NULL::text, p_data_encerramento date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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

  PERFORM id FROM motos WHERE id = v_moto_id FOR UPDATE;

  -- Guarda quem encerrou e a observação na própria garantia: é o que o comprovante
  -- imprime, e historico_estoque só recebe a observação quando a moto volta a ficar
  -- disponível.
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
    UPDATE motos SET status = 'disponivel' WHERE id = v_moto_id;

    INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
    VALUES (v_moto_id, p_usuario_id, 'mudanca_status', 'em_garantia', 'disponivel', p_observacao);
  END IF;
END;
$$;


--
-- Name: expirar_garantias(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expirar_garantias() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: fn_set_venda_numero(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_venda_numero() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT numero INTO NEW.numero FROM pedidos_venda WHERE id = NEW.pedido_venda_id;
  RETURN NEW;
END;
$$;


--
-- Name: get_loja_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_loja_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT loja_id FROM usuarios WHERE id = auth.uid()
$$;


--
-- Name: get_papel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_papel() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT papel FROM usuarios WHERE id = auth.uid()
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT get_papel() = 'admin_geral'
$$;


--
-- Name: mudar_status_moto(uuid, public.moto_status, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mudar_status_moto(p_moto_id uuid, p_novo_status public.moto_status, p_usuario_id uuid, p_observacao text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: recusar_transferencia(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recusar_transferencia(p_transferencia_id uuid, p_respondido_por uuid, p_observacao text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: solicitar_transferencia(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.solicitar_transferencia(p_moto_id uuid, p_loja_destino_id uuid, p_solicitado_por uuid, p_observacao text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_status moto_status;
  v_loja_origem_id uuid;
  v_transferencia_id uuid;
BEGIN
  SELECT status, loja_id INTO v_status, v_loja_origem_id
  FROM motos WHERE id = p_moto_id FOR UPDATE;

  IF v_status = 'vendida' THEN
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agendamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agendamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    loja_id uuid NOT NULL,
    mecanico_id uuid,
    cliente_id uuid,
    cliente_nome text NOT NULL,
    cliente_fone text NOT NULL,
    tipo_servico text NOT NULL,
    descricao_cliente text,
    data_hora_inicio timestamp with time zone NOT NULL,
    duracao_minutos integer DEFAULT 60 NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    os_id uuid,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agendamentos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'cancelado'::text, 'concluido'::text])))
);


--
-- Name: aprovacoes_venda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aprovacoes_venda (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    moto_id uuid,
    loja_id uuid NOT NULL,
    vendedor_id uuid NOT NULL,
    valor numeric(12,2) NOT NULL,
    dados_venda jsonb NOT NULL,
    motivo text NOT NULL,
    disponibilidade_anterior public.disponibilidade_moto,
    status public.aprovacao_venda_status DEFAULT 'pendente'::public.aprovacao_venda_status NOT NULL,
    respondido_por uuid,
    data_solicitacao timestamp with time zone DEFAULT now() NOT NULL,
    data_resposta timestamp with time zone,
    tipo public.aprovacao_venda_tipo DEFAULT 'valor_minimo'::public.aprovacao_venda_tipo NOT NULL,
    os_id uuid,
    origem text DEFAULT 'moto'::text NOT NULL,
    valor_minimo_snapshot numeric(12,2),
    liquido_snapshot numeric(12,2),
    snapshot_estimado boolean DEFAULT false NOT NULL
);


--
-- Name: assinatura_codigos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assinatura_codigos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_id uuid NOT NULL,
    codigo_hash text NOT NULL,
    expira_em timestamp with time zone NOT NULL,
    tentativas integer DEFAULT 0 NOT NULL,
    usado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assinatura_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assinatura_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_id uuid NOT NULL,
    tipo text NOT NULL,
    ip text,
    user_agent text,
    detalhe jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assinatura_eventos_tipo_check CHECK ((tipo = ANY (ARRAY['enviado'::text, 'link_aberto'::text, 'codigo_enviado'::text, 'codigo_errado'::text, 'codigo_ok'::text, 'selfie_enviada'::text, 'assinado'::text, 'reenviado'::text, 'cancelado'::text, 'assinado_em_papel'::text])))
);


--
-- Name: beneficiarios_despesa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beneficiarios_despesa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    nome text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bling_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_config (
    access_token text,
    refresh_token text,
    expires_at timestamp with time zone,
    atualizado_em timestamp with time zone DEFAULT now(),
    grupo_id uuid NOT NULL
);


--
-- Name: calendario_categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendario_categorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT 'slate'::text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendario_evento_usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendario_evento_usuarios (
    evento_id uuid NOT NULL,
    usuario_id uuid NOT NULL
);


--
-- Name: calendario_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendario_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    titulo text NOT NULL,
    descricao text,
    data_inicio date NOT NULL,
    hora text,
    recorrencia public.calendario_recorrencia DEFAULT 'nenhuma'::public.calendario_recorrencia NOT NULL,
    visibilidade public.calendario_visibilidade NOT NULL,
    loja_id uuid,
    criado_por uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    categoria_id uuid NOT NULL,
    data_fim date NOT NULL
);


--
-- Name: categorias_caixa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_caixa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    conta_como_despesa boolean DEFAULT true NOT NULL,
    CONSTRAINT categorias_caixa_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text, 'ambos'::text])))
);


--
-- Name: categorias_despesa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_despesa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    conta_como_despesa boolean DEFAULT true NOT NULL,
    motivo_nao_operacional text,
    grupo_dre text,
    exige_beneficiario boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN categorias_despesa.conta_como_despesa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categorias_despesa.conta_como_despesa IS 'false = saída real, mas não é custo de operar a loja (compra de mercadoria, retirada de sócio). Fica de fora do card Despesas Operacionais do /financeiro.';


--
-- Name: COLUMN categorias_despesa.grupo_dre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categorias_despesa.grupo_dre IS 'Linha do DRE: pessoal, ocupacao, comerciais, administrativas, logistica, tributos, oficina, outras. NULL cai em "Outras" na leitura.';


--
-- Name: certificados_digitais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificados_digitais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    arquivo text NOT NULL,
    senha text NOT NULL,
    cnpj text NOT NULL,
    titular text NOT NULL,
    valido_ate timestamp with time zone NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    uf text NOT NULL
);


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo_pessoa public.tipo_pessoa DEFAULT 'fisica'::public.tipo_pessoa NOT NULL,
    cpf_cnpj text,
    sexo public.sexo DEFAULT 'nao_identificado'::public.sexo NOT NULL,
    email text,
    celular text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cep text,
    cidade text,
    uf text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comunicados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comunicados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    conteudo text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_por_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    data_postagem timestamp with time zone,
    papeis text[] DEFAULT '{}'::text[] NOT NULL,
    grupo_id uuid NOT NULL
);


--
-- Name: comunicados_lidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comunicados_lidos (
    comunicado_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    lido_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conciliacoes_cartao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conciliacoes_cartao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operadora text NOT NULL,
    data_transacao date NOT NULL,
    nsu text,
    autorizacao text,
    valor_bruto numeric(12,2) NOT NULL,
    valor_liquido numeric(12,2),
    parcelas integer DEFAULT 1 NOT NULL,
    tipo text DEFAULT 'credito'::text NOT NULL,
    status text DEFAULT 'aprovado'::text NOT NULL,
    venda_id uuid,
    conciliado boolean DEFAULT false NOT NULL,
    conciliado_em timestamp with time zone,
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    grupo_id uuid NOT NULL,
    peca_venda_id uuid,
    os_id uuid,
    CONSTRAINT conciliacoes_cartao_operadora_check CHECK ((operadora = ANY (ARRAY['infinitypay'::text, 'stone'::text, 'pagueveloz'::text]))),
    CONSTRAINT conciliacoes_cartao_tipo_check CHECK ((tipo = ANY (ARRAY['credito'::text, 'debito'::text])))
);


--
-- Name: configuracao_taxas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracao_taxas (
    taxas_cartao jsonb DEFAULT '{}'::jsonb NOT NULL,
    taxas_link jsonb DEFAULT '{}'::jsonb NOT NULL,
    taxas_financiamento jsonb DEFAULT '{}'::jsonb NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    taxas_debito jsonb DEFAULT '{}'::jsonb NOT NULL,
    grupo_id uuid NOT NULL,
    frete_valor_km numeric(6,2) DEFAULT 3.00 NOT NULL,
    frete_km_gratis integer DEFAULT 40 NOT NULL,
    imposto numeric(6,4) DEFAULT 0.06 NOT NULL,
    frete_valor_fixo numeric(6,2) DEFAULT 0.00 NOT NULL
);


--
-- Name: contas_pagar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas_pagar (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    loja_id uuid,
    descricao text NOT NULL,
    categoria text,
    tipo text NOT NULL,
    valor numeric(12,2),
    data_vencimento date,
    dia_vencimento integer,
    formula_base text,
    formula_percentual numeric(6,3),
    inicio text,
    fim text,
    ativo boolean DEFAULT true NOT NULL,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    formula_mes_ref text DEFAULT 'anterior'::text NOT NULL
);


--
-- Name: contas_pagar_ocorrencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas_pagar_ocorrencias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    competencia text NOT NULL,
    vencimento date NOT NULL,
    valor numeric(12,2) NOT NULL,
    pago boolean DEFAULT false NOT NULL,
    pago_em date,
    pago_por uuid,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cupons_revisao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cupons_revisao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    loja_id uuid NOT NULL,
    codigo text NOT NULL,
    cliente_id uuid,
    cliente_nome text,
    moto_id uuid,
    chassi text,
    observacao text,
    valido_ate date NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    os_id uuid,
    usado_em timestamp with time zone,
    valor_abatido numeric(10,2),
    emitido_por uuid,
    emitido_em timestamp with time zone DEFAULT now() NOT NULL,
    cancelado_por uuid,
    cancelado_em timestamp with time zone,
    motivo_cancelamento text
);


--
-- Name: demandas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demandas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    modelo text NOT NULL,
    cor text NOT NULL,
    loja_id uuid NOT NULL,
    solicitante_id uuid NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    sinal_recebido boolean DEFAULT false NOT NULL,
    valor_sinal numeric(10,2),
    modelo_id uuid,
    numero integer,
    meio_pagamento text,
    sinal_recebido_em timestamp with time zone,
    status public.demanda_status DEFAULT 'aberta'::public.demanda_status NOT NULL,
    venda_id uuid,
    cliente_nome text,
    cliente_cpf text,
    cliente_celular text,
    cliente_email text,
    cliente_cep text,
    cliente_logradouro text,
    cliente_numero text,
    cliente_complemento text,
    cliente_bairro text,
    cliente_cidade text,
    cliente_estado text,
    pagamentos jsonb
);


--
-- Name: despesas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.despesas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    loja_id uuid,
    usuario_id uuid NOT NULL,
    categoria text NOT NULL,
    descricao text,
    valor numeric(12,2) NOT NULL,
    data date NOT NULL,
    forma_pagamento text NOT NULL,
    banco text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    grupo_id uuid NOT NULL,
    beneficiario text
);


--
-- Name: despesas_of_sync_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.despesas_of_sync_status (
    grupo_id uuid NOT NULL,
    ultima_sincronizacao timestamp with time zone NOT NULL
);


--
-- Name: despesas_open_finance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.despesas_open_finance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    conta_id text NOT NULL,
    banco text NOT NULL,
    transacao_id text NOT NULL,
    data timestamp with time zone NOT NULL,
    valor numeric(12,2) NOT NULL,
    favorecido_nome text,
    descricao text,
    tipo_operacao text,
    categoria text,
    loja_id uuid,
    despesa_id uuid,
    lancado_por_id uuid,
    lancado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documentos_assinatura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_assinatura (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    loja_id uuid,
    venda_id uuid NOT NULL,
    tipo text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    html_snapshot text NOT NULL,
    snapshot_hash text NOT NULL,
    celular_destino text NOT NULL,
    selfie_path text,
    selfie_hash text,
    assinatura_path text,
    assinatura_hash text,
    ip_assinatura text,
    user_agent text,
    geo_lat numeric(10,7),
    geo_lon numeric(10,7),
    geo_precisao numeric(10,2),
    evidencias_json jsonb,
    doc_hash text,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    expira_em timestamp with time zone NOT NULL,
    assinado_em timestamp with time zone,
    respostas_json jsonb,
    dados_json jsonb,
    assinatura_modo text DEFAULT 'digital'::text NOT NULL,
    via_fisica_path text,
    via_fisica_hash text,
    registrado_por uuid,
    email_destino text,
    CONSTRAINT documentos_assinatura_modo_check CHECK ((assinatura_modo = ANY (ARRAY['digital'::text, 'papel'::text]))),
    CONSTRAINT documentos_assinatura_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'visualizado'::text, 'assinado'::text, 'expirado'::text, 'cancelado'::text]))),
    CONSTRAINT documentos_assinatura_tipo_check CHECK ((tipo = ANY (ARRAY['contrato_venda'::text, 'checklist_entrega'::text])))
);


--
-- Name: COLUMN documentos_assinatura.respostas_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documentos_assinatura.respostas_json IS 'Checklist preenchido pelo comprador: { itens: { "<item>": "ok|nao|na" }, observacoes: text }';


--
-- Name: COLUMN documentos_assinatura.assinatura_modo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documentos_assinatura.assinatura_modo IS 'digital = assinado pelo celular do cliente; papel = assinado na loja e digitalizado';


--
-- Name: fabrica_sync_loja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fabrica_sync_loja (
    loja_id uuid NOT NULL,
    status text NOT NULL,
    erro text,
    pedidos integer DEFAULT 0 NOT NULL,
    executado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fabrica_sync_loja_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'sem_credencial'::text, 'erro'::text])))
);


--
-- Name: TABLE fabrica_sync_loja; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fabrica_sync_loja IS 'Resultado da última leitura do portal da fábrica por loja — alimenta o card de pedidos aguardando pagamento no dashboard.';


--
-- Name: favorecidos_nao_operacionais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorecidos_nao_operacionais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    cnpj text,
    rotulo text NOT NULL,
    motivo text DEFAULT 'compra_moto'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    nome_padrao text,
    CONSTRAINT favorecidos_nao_operacionais_chave_check CHECK (((cnpj IS NOT NULL) OR (nome_padrao IS NOT NULL)))
);


--
-- Name: TABLE favorecidos_nao_operacionais; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.favorecidos_nao_operacionais IS 'Favorecidos cujas saídas não entram no card Despesas Operacionais. Hoje: fábricas de moto.';


--
-- Name: folha_adiantamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folha_adiantamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    loja_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    mes text NOT NULL,
    valor numeric(12,2) NOT NULL,
    data date,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid
);


--
-- Name: folha_ajustes_base; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folha_ajustes_base (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    loja_id uuid NOT NULL,
    mes text NOT NULL,
    tipo text NOT NULL,
    usuario_id uuid,
    valor numeric(12,2) NOT NULL,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid
);


--
-- Name: folha_regras_comissao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folha_regras_comissao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    tipo text NOT NULL,
    base text NOT NULL,
    percentual numeric(6,3) NOT NULL,
    vigencia_inicio text,
    vigencia_fim text,
    descricao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid
);


--
-- Name: folha_valores_reais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folha_valores_reais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    mes text NOT NULL,
    valor numeric(12,2) NOT NULL,
    atualizado_por uuid,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: funcionarios_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funcionarios_config (
    usuario_id uuid NOT NULL,
    salario numeric(10,2) DEFAULT 0 NOT NULL,
    comissao_percentual numeric(5,2) DEFAULT 0 NOT NULL,
    ajuda_custo numeric(10,2),
    ativo boolean DEFAULT true NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    base_comissao text DEFAULT 'padrao'::text NOT NULL,
    adiantamento_fixo numeric(10,2)
);


--
-- Name: garantias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garantias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    moto_id uuid NOT NULL,
    loja_id uuid NOT NULL,
    os_id uuid,
    descricao text NOT NULL,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    status public.garantia_status DEFAULT 'ativa'::public.garantia_status NOT NULL,
    data_pedido_peca date,
    numero_pedido_fabrica text,
    data_encerramento date,
    status_fabrica text,
    status_fabrica_sync_em timestamp with time zone,
    fabrica_conta_loja_id uuid,
    observacao_encerramento text,
    encerrada_por uuid,
    encerrada_em timestamp with time zone,
    CONSTRAINT garantias_data_fim_check CHECK ((data_fim > data_inicio))
);


--
-- Name: COLUMN garantias.fabrica_conta_loja_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.garantias.fabrica_conta_loja_id IS 'Loja cuja conta no portal da fabrica enxerga este pedido. NULL = a conta da propria loja da garantia.';


--
-- Name: grupos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grupos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    cnpj text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    validapix_email text,
    validapix_password text,
    bling_client_id text,
    bling_client_secret text,
    telegram_chat_id text,
    meta_motos_mes integer,
    cor text,
    razao_social text,
    endereco_sede text,
    comarca_foro text,
    cidade_sede text,
    mcpai_endpoint_url text
);


--
-- Name: COLUMN grupos.meta_motos_mes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grupos.meta_motos_mes IS 'OBSOLETO desde 0066: a meta virou metas_loja (por loja, em R$, por mês). Nada lê esta coluna.';


--
-- Name: historico_estoque; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historico_estoque (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    moto_id uuid NOT NULL,
    loja_origem_id uuid,
    loja_destino_id uuid,
    usuario_id uuid NOT NULL,
    tipo public.historico_tipo NOT NULL,
    status_anterior public.moto_status,
    status_novo public.moto_status,
    referencia_tipo public.referencia_tipo,
    referencia_id uuid,
    data timestamp with time zone DEFAULT now() NOT NULL,
    observacao text
);


--
-- Name: holerites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holerites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    mes text NOT NULL,
    tipo text NOT NULL,
    arquivo_path text NOT NULL,
    arquivo_nome text NOT NULL,
    tamanho integer,
    enviado_por uuid,
    enviado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: importacoes_cartao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.importacoes_cartao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    solicitado_por uuid,
    status text DEFAULT 'pendente'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    iniciado_em timestamp with time zone,
    concluido_em timestamp with time zone,
    resultado jsonb,
    erro text
);


--
-- Name: kommo_atividade_diaria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_atividade_diaria (
    dia date NOT NULL,
    kommo_user_id text NOT NULL,
    mensagens integer DEFAULT 0 NOT NULL,
    tarefas integer DEFAULT 0 NOT NULL,
    resp_soma_seg bigint DEFAULT 0 NOT NULL,
    resp_qtd integer DEFAULT 0 NOT NULL,
    resp_mediana_seg bigint DEFAULT 0 NOT NULL
);


--
-- Name: kommo_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_config (
    id text DEFAULT 'global'::text NOT NULL,
    subdominio text,
    client_id text,
    client_secret text,
    access_token text,
    refresh_token text,
    expires_at timestamp with time zone,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kommo_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_leads (
    lead_id bigint NOT NULL,
    kommo_user_id text,
    status_id integer,
    pipeline_id text,
    price numeric(12,2) DEFAULT 0 NOT NULL,
    criado_em timestamp with time zone,
    fechado_em timestamp with time zone,
    atualizado_em timestamp with time zone,
    loss_reason_id bigint,
    primeiro_incoming_em timestamp with time zone,
    primeira_resposta_em timestamp with time zone,
    nome text,
    source_id bigint
);


--
-- Name: kommo_loss_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_loss_reasons (
    id bigint NOT NULL,
    nome text NOT NULL
);


--
-- Name: kommo_pipeline_grupo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_pipeline_grupo (
    pipeline_id text NOT NULL,
    grupo_id uuid,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kommo_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_sources (
    source_id bigint NOT NULL,
    origem text,
    perfil text,
    nome text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kommo_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_stages (
    status_id bigint NOT NULL,
    pipeline_id text,
    pipeline_nome text,
    nome text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    etapa_fechamento boolean DEFAULT false NOT NULL
);


--
-- Name: kommo_sync_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_sync_status (
    id text DEFAULT 'global'::text NOT NULL,
    ultima_sincronizacao timestamp with time zone,
    ultimo_updated_at bigint
);


--
-- Name: kommo_tarefas_abertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_tarefas_abertas (
    id bigint NOT NULL,
    lead_id bigint NOT NULL,
    kommo_user_id text,
    prazo timestamp with time zone,
    texto text
);


--
-- Name: kommo_user_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kommo_user_map (
    kommo_user_id text NOT NULL,
    usuario_id uuid,
    nome_kommo text
);


--
-- Name: lancamentos_caixa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lancamentos_caixa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    loja_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    tipo public.tipo_lancamento NOT NULL,
    categoria text NOT NULL,
    descricao text,
    valor numeric(12,2) NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    venda_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    comprovante_url text,
    aprovado_por_id uuid,
    aprovado_em timestamp with time zone,
    status_aprovacao text DEFAULT 'pendente'::text NOT NULL,
    os_id uuid
);


--
-- Name: leads_convencao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads_convencao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    whatsapp text NOT NULL,
    unidade text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lojas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lojas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    cidade text NOT NULL,
    endereco text NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    grupo_id uuid NOT NULL,
    cep text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    fabrica_email text,
    fabrica_senha text
);


--
-- Name: marketing_investimento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_investimento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    mes date NOT NULL,
    pipeline_id text,
    plataforma text NOT NULL,
    valor numeric(12,2) DEFAULT 0 NOT NULL,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: metas_loja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metas_loja (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    loja_id uuid NOT NULL,
    ano integer NOT NULL,
    mes integer NOT NULL,
    valor_meta numeric(12,2) NOT NULL,
    atualizado_em timestamp without time zone DEFAULT now() NOT NULL,
    atualizado_por uuid,
    CONSTRAINT metas_loja_mes_check CHECK (((mes >= 1) AND (mes <= 12))),
    CONSTRAINT metas_loja_valor_meta_check CHECK ((valor_meta >= (0)::numeric))
);


--
-- Name: modelo_apelidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modelo_apelidos (
    apelido text NOT NULL,
    modelo_id uuid NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: modelo_bling_codigos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modelo_bling_codigos (
    modelo_id uuid NOT NULL,
    grupo_id uuid NOT NULL,
    codigo text NOT NULL
);


--
-- Name: modelos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modelos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    marca text NOT NULL,
    modelo text NOT NULL,
    categoria public.categoria NOT NULL,
    potencia_w text NOT NULL,
    motor text NOT NULL,
    velocidade_max text NOT NULL,
    preco_compra_padrao numeric(12,2),
    imagem_url text
);


--
-- Name: motos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chassi text NOT NULL,
    modelo_id uuid NOT NULL,
    loja_id uuid NOT NULL,
    status public.moto_status DEFAULT 'caixa'::public.moto_status NOT NULL,
    cor text NOT NULL,
    nota_fiscal_entrada text NOT NULL,
    responsavel_montagem_id uuid,
    data_montagem date,
    disponibilidade public.disponibilidade_moto,
    motor text,
    preco_compra numeric(12,2),
    somente_garantia boolean DEFAULT false NOT NULL
);


--
-- Name: motos_fiscal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motos_fiscal (
    moto_id uuid NOT NULL,
    emitente_cnpj text NOT NULL,
    emitente_nome text,
    nf_numero text,
    nf_chave text,
    c_prod text,
    x_prod text,
    ncm text NOT NULL,
    cest text,
    unidade text,
    origem text,
    cfop_entrada text,
    cst_icms_entrada text,
    cst_pis text,
    cst_cofins text,
    class_trib_ibscbs text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nfe_dfe_sync; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfe_dfe_sync (
    grupo_id uuid NOT NULL,
    ult_nsu text DEFAULT '0'::text NOT NULL,
    max_nsu text DEFAULT '0'::text NOT NULL,
    proxima_consulta_em timestamp with time zone,
    ultimo_cstat integer,
    ultimo_erro text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nfe_recebidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfe_recebidas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    chave text NOT NULL,
    nsu text NOT NULL,
    emitente_cnpj text NOT NULL,
    emitente_nome text NOT NULL,
    valor numeric(12,2),
    data_emissao timestamp with time zone NOT NULL,
    situacao text DEFAULT 'resumo'::text NOT NULL,
    manifestado_em timestamp with time zone,
    xml text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    avisado_em timestamp with time zone,
    CONSTRAINT nfe_recebidas_situacao_check CHECK ((situacao = ANY (ARRAY['resumo'::text, 'completa'::text, 'cancelada'::text])))
);


--
-- Name: notagateway_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notagateway_config (
    grupo_id uuid NOT NULL,
    token text NOT NULL,
    empresa_id text,
    ambiente text DEFAULT 'Homologacao'::text NOT NULL,
    serie_nfe text DEFAULT '1'::text NOT NULL,
    proximo_numero integer DEFAULT 1 NOT NULL,
    certificado_enviado_em timestamp with time zone,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notas_fiscais_saida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notas_fiscais_saida (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venda_id uuid NOT NULL,
    grupo_id uuid NOT NULL,
    id_externo text NOT NULL,
    ambiente text NOT NULL,
    status text DEFAULT 'Enviando'::text NOT NULL,
    motivo_status text,
    numero text,
    serie text,
    chave text,
    protocolo text,
    link_danfe text,
    link_xml text,
    payload jsonb NOT NULL,
    emitida_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: numero_venda_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.numero_venda_seq
    START WITH 30000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordens_servico_numero_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordens_servico_numero_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordens_servico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordens_servico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    moto_id uuid,
    loja_id uuid NOT NULL,
    aberta_por uuid NOT NULL,
    mecanico_id uuid,
    status public.os_status DEFAULT 'aberta'::public.os_status NOT NULL,
    descricao text NOT NULL,
    data_abertura timestamp with time zone DEFAULT now() NOT NULL,
    data_conclusao timestamp with time zone,
    cliente_id uuid,
    numero integer DEFAULT nextval('public.ordens_servico_numero_seq'::regclass),
    marca_externa text,
    modelo_externo text,
    placa text,
    km integer,
    diagnostico text,
    observacoes_finais text,
    valor_total numeric(10,2),
    forma_pagamento text,
    data_previsao timestamp with time zone,
    cliente_nome_externo text,
    cliente_fone_externo text,
    agendamento_id uuid,
    origem text DEFAULT 'walk_in'::text NOT NULL,
    chassi_os text,
    oficina_em timestamp with time zone,
    em_andamento_em timestamp with time zone,
    finalizada_em timestamp with time zone,
    pendente_pagamento_em timestamp with time zone,
    pagamentos jsonb,
    valor_servicos numeric(10,2) DEFAULT 0 NOT NULL,
    valor_pecas numeric(10,2) DEFAULT 0 NOT NULL,
    motivo_cancelamento text,
    cancelada_em timestamp with time zone,
    cancelada_por uuid,
    cliente_documento_externo text,
    cliente_tipo_pessoa_externo text,
    CONSTRAINT ordens_servico_origem_check CHECK ((origem = ANY (ARRAY['walk_in'::text, 'agendamento'::text, 'pos_venda'::text, 'interna'::text, 'externa'::text])))
);


--
-- Name: origens_venda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.origens_venda (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    nome text NOT NULL,
    tipo text DEFAULT 'Outro'::text NOT NULL,
    pede_detalhe boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT origens_venda_tipo_check CHECK ((tipo = ANY (ARRAY['Digital'::text, 'Presencial'::text, 'Relacional'::text, 'Parceria'::text, 'Ativo'::text, 'Outro'::text])))
);


--
-- Name: os_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.os_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    os_id uuid NOT NULL,
    tipo text DEFAULT 'servico'::text NOT NULL,
    descricao text NOT NULL,
    quantidade numeric(10,3) DEFAULT 1 NOT NULL,
    valor_unitario numeric(10,2) DEFAULT 0 NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    servico_id uuid,
    peca_id uuid
);


--
-- Name: pecas_catalogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pecas_catalogo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    valor numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    quantidade_estoque integer DEFAULT 0 NOT NULL
);


--
-- Name: pecas_catalogo_valor_bkp_20260828; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pecas_catalogo_valor_bkp_20260828 (
    id uuid,
    valor numeric(10,2)
);


--
-- Name: pedidos_fabrica_alerta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos_fabrica_alerta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    numero_pedido text NOT NULL,
    valor numeric(12,2),
    data_pedido text,
    primeiro_alerta_em timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_alerta_em timestamp with time zone DEFAULT now() NOT NULL,
    resolvido_em timestamp with time zone,
    loja_id uuid NOT NULL,
    avisado_em timestamp with time zone
);


--
-- Name: pedidos_venda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos_venda (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    moto_id uuid NOT NULL,
    loja_id uuid NOT NULL,
    vendedor_id uuid NOT NULL,
    status public.pedido_status DEFAULT 'pendente'::public.pedido_status NOT NULL,
    data_pedido timestamp with time zone DEFAULT now() NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT now() NOT NULL,
    observacao text,
    numero integer DEFAULT nextval('public.numero_venda_seq'::regclass) NOT NULL
);


--
-- Name: pix_mcp_sync_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pix_mcp_sync_status (
    grupo_id uuid NOT NULL,
    ultima_sincronizacao timestamp with time zone NOT NULL
);


--
-- Name: pix_recebimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pix_recebimentos (
    id text NOT NULL,
    data_pagamento timestamp with time zone NOT NULL,
    valor numeric(12,2) NOT NULL,
    pagador_nome text,
    pagador_documento text,
    observacao text,
    venda_id uuid,
    pedido_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    grupo_id uuid NOT NULL
);


--
-- Name: pix_recebimentos_mcp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pix_recebimentos_mcp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id text NOT NULL,
    banco text NOT NULL,
    transacao_id text NOT NULL,
    data timestamp with time zone NOT NULL,
    valor numeric(12,2) NOT NULL,
    pagador_nome text,
    descricao text,
    tipo_correspondencia public.tipo_correspondencia_pix,
    venda_id uuid,
    os_id uuid,
    lancado_por_id uuid,
    lancado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    grupo_id uuid NOT NULL,
    peca_venda_id uuid,
    pedido_id uuid,
    tipo_operacao text
);


--
-- Name: precificacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precificacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    valor_minimo numeric(12,2) NOT NULL,
    taxa_pix numeric(8,6) DEFAULT 0 NOT NULL,
    taxas_cartao jsonb DEFAULT '{}'::jsonb NOT NULL,
    taxas_link jsonb DEFAULT '{}'::jsonb NOT NULL,
    taxas_financiamento jsonb DEFAULT '{}'::jsonb NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    custo numeric(12,2),
    imagem_url text,
    grupo_id uuid NOT NULL
);


--
-- Name: premiacao_faixas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.premiacao_faixas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    valor_minimo_vendas numeric(12,2) NOT NULL,
    premiacao numeric(10,2) NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: regras_fiscais_saida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regras_fiscais_saida (
    grupo_id uuid NOT NULL,
    natureza_operacao text NOT NULL,
    cfop_interno text NOT NULL,
    cst_icms_interno text NOT NULL,
    cfop_interestadual text NOT NULL,
    cst_icms_interestadual text NOT NULL,
    aliquota_icms_interestadual numeric(5,2),
    cst_pis text NOT NULL,
    aliquota_pis numeric(6,4),
    cst_cofins text NOT NULL,
    aliquota_cofins numeric(6,4),
    cst_ipi text,
    cst_ibscbs text,
    class_trib_ibscbs text,
    crt integer DEFAULT 3 NOT NULL,
    origem_fixa text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    ibpt_federal numeric(5,2),
    ibpt_estadual numeric(5,2)
);


--
-- Name: reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    moto_id uuid NOT NULL,
    loja_id uuid NOT NULL,
    vendedor_id uuid NOT NULL,
    valor_reserva numeric(12,2) NOT NULL,
    meio_pagamento text NOT NULL,
    data_prevista_finalizacao date NOT NULL,
    status public.reserva_status DEFAULT 'ativa'::public.reserva_status NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    cliente_nome text,
    cliente_cpf text,
    cliente_celular text,
    cliente_email text,
    cliente_cep text,
    cliente_logradouro text,
    cliente_numero text,
    cliente_complemento text,
    cliente_bairro text,
    cliente_cidade text,
    cliente_estado text,
    cartao_operadora text,
    cartao_parcelas integer,
    valor_total_venda numeric(12,2),
    numero integer DEFAULT nextval('public.numero_venda_seq'::regclass) NOT NULL,
    cancelada_em timestamp with time zone,
    cancelada_por uuid,
    cancelamento_motivo text,
    pagamentos jsonb
);


--
-- Name: servicos_catalogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicos_catalogo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tempo_previsto_minutos integer,
    valor numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: simulador_precos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.simulador_precos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    preco_avista numeric(10,2) NOT NULL,
    preco_pix numeric(10,2) NOT NULL,
    taxa_cartao_fisico numeric(8,6) NOT NULL,
    taxa_link_pagamento numeric(8,6) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transferencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transferencias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    moto_id uuid NOT NULL,
    loja_origem_id uuid NOT NULL,
    loja_destino_id uuid NOT NULL,
    solicitado_por uuid NOT NULL,
    respondido_por uuid,
    status public.transferencia_status DEFAULT 'pendente'::public.transferencia_status NOT NULL,
    data_solicitacao timestamp with time zone DEFAULT now() NOT NULL,
    data_resposta timestamp with time zone,
    observacao text
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    papel public.papel NOT NULL,
    loja_id uuid,
    conecta text,
    papeis_extras text[] DEFAULT '{}'::text[] NOT NULL,
    grupos_aprovacao uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    aprova_pagamento_sensivel boolean DEFAULT false NOT NULL,
    modulos_extras text[] DEFAULT '{}'::text[] NOT NULL,
    modulos_bloqueados text[] DEFAULT '{}'::text[] NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    grupos_acesso uuid[] DEFAULT '{}'::uuid[] NOT NULL
);


--
-- Name: usuarios_dados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_dados (
    usuario_id uuid NOT NULL,
    cpf text NOT NULL,
    pix_tipo text NOT NULL,
    pix_chave text NOT NULL,
    data_nascimento date NOT NULL,
    preenchido_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: veiculos_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiculos_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chassi text NOT NULL,
    numero_motor text,
    marca text DEFAULT ''::text NOT NULL,
    modelo text DEFAULT ''::text NOT NULL,
    cor text,
    ano integer,
    importado_em timestamp with time zone DEFAULT now() NOT NULL,
    nf_entrada text
);


--
-- Name: vendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_venda_id uuid NOT NULL,
    moto_id uuid NOT NULL,
    loja_id uuid NOT NULL,
    vendedor_id uuid NOT NULL,
    efetivado_por uuid NOT NULL,
    cliente_nome text NOT NULL,
    cliente_cpf text NOT NULL,
    valor numeric(12,2) NOT NULL,
    forma_pagamento text NOT NULL,
    data_venda timestamp with time zone DEFAULT now() NOT NULL,
    cliente_celular text,
    cliente_email text,
    cliente_cep text,
    cliente_logradouro text,
    cliente_bairro text,
    cliente_cidade text,
    cliente_estado text,
    pagamentos jsonb,
    reserva_id uuid,
    cliente_numero text,
    cliente_complemento text,
    nota_fiscal_saida text,
    numero integer NOT NULL,
    status_conciliacao text DEFAULT 'pendente'::text NOT NULL,
    cliente_id uuid,
    bling_nfe_id bigint,
    origem_id uuid,
    origem_detalhe text,
    nf_liberada_em timestamp with time zone,
    nf_liberada_por uuid,
    nf_liberacao_motivo text
);


--
-- Name: COLUMN vendas.origem_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendas.origem_id IS 'Por onde o cliente chegou. NULL = venda anterior ao deploy (aparece como "Nao informado").';


--
-- Name: COLUMN vendas.nf_liberada_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendas.nf_liberada_em IS 'Preenchido quando admin libera a NF sem contrato assinado. O motivo é obrigatório.';


--
-- Name: vendas_pecas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendas_pecas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero integer DEFAULT nextval('public.numero_venda_seq'::regclass) NOT NULL,
    loja_id uuid NOT NULL,
    vendedor_id uuid NOT NULL,
    cliente_nome text,
    forma_pagamento text NOT NULL,
    pagamentos jsonb,
    valor_total numeric(12,2) NOT NULL,
    data_venda timestamp with time zone DEFAULT now() NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    cliente_id uuid,
    cliente_documento text,
    cliente_tipo_pessoa text DEFAULT 'fisica'::text NOT NULL
);


--
-- Name: vendas_pecas_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendas_pecas_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venda_peca_id uuid NOT NULL,
    peca_id uuid NOT NULL,
    descricao text NOT NULL,
    quantidade numeric(10,2) DEFAULT 1 NOT NULL,
    valor_unitario numeric(10,2) DEFAULT 0 NOT NULL
);


--
-- Name: vendas_seguras; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vendas_seguras AS
 SELECT id,
    pedido_venda_id,
    moto_id,
    loja_id,
    vendedor_id,
    efetivado_por,
    cliente_nome,
        CASE
            WHEN (((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'papel'::text) = ANY (ARRAY['admin_geral'::text, 'aux_adm'::text])) THEN cliente_cpf
            ELSE '***.***.***-**'::text
        END AS cliente_cpf,
    valor,
    forma_pagamento,
    data_venda
   FROM public.vendas;


--
-- Name: agendamentos agendamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_pkey PRIMARY KEY (id);


--
-- Name: aprovacoes_venda aprovacoes_venda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprovacoes_venda
    ADD CONSTRAINT aprovacoes_venda_pkey PRIMARY KEY (id);


--
-- Name: assinatura_codigos assinatura_codigos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assinatura_codigos
    ADD CONSTRAINT assinatura_codigos_pkey PRIMARY KEY (id);


--
-- Name: assinatura_eventos assinatura_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assinatura_eventos
    ADD CONSTRAINT assinatura_eventos_pkey PRIMARY KEY (id);


--
-- Name: beneficiarios_despesa beneficiarios_despesa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficiarios_despesa
    ADD CONSTRAINT beneficiarios_despesa_pkey PRIMARY KEY (id);


--
-- Name: bling_config bling_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_config
    ADD CONSTRAINT bling_config_pkey PRIMARY KEY (grupo_id);


--
-- Name: calendario_categorias calendario_categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_categorias
    ADD CONSTRAINT calendario_categorias_pkey PRIMARY KEY (id);


--
-- Name: calendario_evento_usuarios calendario_evento_usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_evento_usuarios
    ADD CONSTRAINT calendario_evento_usuarios_pkey PRIMARY KEY (evento_id, usuario_id);


--
-- Name: calendario_eventos calendario_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_eventos
    ADD CONSTRAINT calendario_eventos_pkey PRIMARY KEY (id);


--
-- Name: categorias_caixa categorias_caixa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_caixa
    ADD CONSTRAINT categorias_caixa_pkey PRIMARY KEY (id);


--
-- Name: categorias_despesa categorias_despesa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_despesa
    ADD CONSTRAINT categorias_despesa_pkey PRIMARY KEY (id);


--
-- Name: certificados_digitais certificados_digitais_grupo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados_digitais
    ADD CONSTRAINT certificados_digitais_grupo_id_key UNIQUE (grupo_id);


--
-- Name: certificados_digitais certificados_digitais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados_digitais
    ADD CONSTRAINT certificados_digitais_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_cpf_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_cpf_cnpj_key UNIQUE (cpf_cnpj);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: comunicados_lidos comunicados_lidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunicados_lidos
    ADD CONSTRAINT comunicados_lidos_pkey PRIMARY KEY (comunicado_id, usuario_id);


--
-- Name: comunicados comunicados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunicados
    ADD CONSTRAINT comunicados_pkey PRIMARY KEY (id);


--
-- Name: conciliacoes_cartao conciliacoes_cartao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacoes_cartao
    ADD CONSTRAINT conciliacoes_cartao_pkey PRIMARY KEY (id);


--
-- Name: configuracao_taxas configuracao_taxas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracao_taxas
    ADD CONSTRAINT configuracao_taxas_pkey PRIMARY KEY (grupo_id);


--
-- Name: contas_pagar_ocorrencias contas_pagar_ocorrencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_pagar_ocorrencias
    ADD CONSTRAINT contas_pagar_ocorrencias_pkey PRIMARY KEY (id);


--
-- Name: contas_pagar contas_pagar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_pagar
    ADD CONSTRAINT contas_pagar_pkey PRIMARY KEY (id);


--
-- Name: cupons_revisao cupons_revisao_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons_revisao
    ADD CONSTRAINT cupons_revisao_codigo_key UNIQUE (codigo);


--
-- Name: cupons_revisao cupons_revisao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons_revisao
    ADD CONSTRAINT cupons_revisao_pkey PRIMARY KEY (id);


--
-- Name: demandas demandas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demandas
    ADD CONSTRAINT demandas_pkey PRIMARY KEY (id);


--
-- Name: despesas_of_sync_status despesas_of_sync_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas_of_sync_status
    ADD CONSTRAINT despesas_of_sync_status_pkey PRIMARY KEY (grupo_id);


--
-- Name: despesas_open_finance despesas_open_finance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas_open_finance
    ADD CONSTRAINT despesas_open_finance_pkey PRIMARY KEY (id);


--
-- Name: despesas_open_finance despesas_open_finance_transacao_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas_open_finance
    ADD CONSTRAINT despesas_open_finance_transacao_id_key UNIQUE (transacao_id);


--
-- Name: despesas despesas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_pkey PRIMARY KEY (id);


--
-- Name: documentos_assinatura documentos_assinatura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura
    ADD CONSTRAINT documentos_assinatura_pkey PRIMARY KEY (id);


--
-- Name: documentos_assinatura documentos_assinatura_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura
    ADD CONSTRAINT documentos_assinatura_token_key UNIQUE (token);


--
-- Name: fabrica_sync_loja fabrica_sync_loja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fabrica_sync_loja
    ADD CONSTRAINT fabrica_sync_loja_pkey PRIMARY KEY (loja_id);


--
-- Name: favorecidos_nao_operacionais favorecidos_nao_operacionais_grupo_id_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorecidos_nao_operacionais
    ADD CONSTRAINT favorecidos_nao_operacionais_grupo_id_cnpj_key UNIQUE (grupo_id, cnpj);


--
-- Name: favorecidos_nao_operacionais favorecidos_nao_operacionais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorecidos_nao_operacionais
    ADD CONSTRAINT favorecidos_nao_operacionais_pkey PRIMARY KEY (id);


--
-- Name: folha_adiantamentos folha_adiantamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_adiantamentos
    ADD CONSTRAINT folha_adiantamentos_pkey PRIMARY KEY (id);


--
-- Name: folha_ajustes_base folha_ajustes_base_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_ajustes_base
    ADD CONSTRAINT folha_ajustes_base_pkey PRIMARY KEY (id);


--
-- Name: folha_regras_comissao folha_regras_comissao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_regras_comissao
    ADD CONSTRAINT folha_regras_comissao_pkey PRIMARY KEY (id);


--
-- Name: folha_valores_reais folha_valores_reais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_valores_reais
    ADD CONSTRAINT folha_valores_reais_pkey PRIMARY KEY (id);


--
-- Name: funcionarios_config funcionarios_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcionarios_config
    ADD CONSTRAINT funcionarios_config_pkey PRIMARY KEY (usuario_id);


--
-- Name: garantias garantias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias
    ADD CONSTRAINT garantias_pkey PRIMARY KEY (id);


--
-- Name: grupos grupos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos
    ADD CONSTRAINT grupos_pkey PRIMARY KEY (id);


--
-- Name: historico_estoque historico_estoque_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_estoque
    ADD CONSTRAINT historico_estoque_pkey PRIMARY KEY (id);


--
-- Name: holerites holerites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holerites
    ADD CONSTRAINT holerites_pkey PRIMARY KEY (id);


--
-- Name: importacoes_cartao importacoes_cartao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.importacoes_cartao
    ADD CONSTRAINT importacoes_cartao_pkey PRIMARY KEY (id);


--
-- Name: kommo_atividade_diaria kommo_atividade_diaria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_atividade_diaria
    ADD CONSTRAINT kommo_atividade_diaria_pkey PRIMARY KEY (dia, kommo_user_id);


--
-- Name: kommo_config kommo_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_config
    ADD CONSTRAINT kommo_config_pkey PRIMARY KEY (id);


--
-- Name: kommo_leads kommo_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_leads
    ADD CONSTRAINT kommo_leads_pkey PRIMARY KEY (lead_id);


--
-- Name: kommo_loss_reasons kommo_loss_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_loss_reasons
    ADD CONSTRAINT kommo_loss_reasons_pkey PRIMARY KEY (id);


--
-- Name: kommo_pipeline_grupo kommo_pipeline_grupo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_pipeline_grupo
    ADD CONSTRAINT kommo_pipeline_grupo_pkey PRIMARY KEY (pipeline_id);


--
-- Name: kommo_sources kommo_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_sources
    ADD CONSTRAINT kommo_sources_pkey PRIMARY KEY (source_id);


--
-- Name: kommo_stages kommo_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_stages
    ADD CONSTRAINT kommo_stages_pkey PRIMARY KEY (status_id);


--
-- Name: kommo_sync_status kommo_sync_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_sync_status
    ADD CONSTRAINT kommo_sync_status_pkey PRIMARY KEY (id);


--
-- Name: kommo_tarefas_abertas kommo_tarefas_abertas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_tarefas_abertas
    ADD CONSTRAINT kommo_tarefas_abertas_pkey PRIMARY KEY (id);


--
-- Name: kommo_user_map kommo_user_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_user_map
    ADD CONSTRAINT kommo_user_map_pkey PRIMARY KEY (kommo_user_id);


--
-- Name: lancamentos_caixa lancamentos_caixa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_caixa
    ADD CONSTRAINT lancamentos_caixa_pkey PRIMARY KEY (id);


--
-- Name: leads_convencao leads_convencao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_convencao
    ADD CONSTRAINT leads_convencao_pkey PRIMARY KEY (id);


--
-- Name: lojas lojas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lojas
    ADD CONSTRAINT lojas_pkey PRIMARY KEY (id);


--
-- Name: marketing_investimento marketing_investimento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_investimento
    ADD CONSTRAINT marketing_investimento_pkey PRIMARY KEY (id);


--
-- Name: metas_loja metas_loja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas_loja
    ADD CONSTRAINT metas_loja_pkey PRIMARY KEY (id);


--
-- Name: metas_loja metas_loja_unica; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas_loja
    ADD CONSTRAINT metas_loja_unica UNIQUE (loja_id, ano, mes);


--
-- Name: modelo_apelidos modelo_apelidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelo_apelidos
    ADD CONSTRAINT modelo_apelidos_pkey PRIMARY KEY (apelido);


--
-- Name: modelo_bling_codigos modelo_bling_codigos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelo_bling_codigos
    ADD CONSTRAINT modelo_bling_codigos_pkey PRIMARY KEY (modelo_id, grupo_id);


--
-- Name: modelos modelos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelos
    ADD CONSTRAINT modelos_pkey PRIMARY KEY (id);


--
-- Name: motos motos_chassi_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motos
    ADD CONSTRAINT motos_chassi_unique UNIQUE (chassi);


--
-- Name: motos_fiscal motos_fiscal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motos_fiscal
    ADD CONSTRAINT motos_fiscal_pkey PRIMARY KEY (moto_id);


--
-- Name: motos motos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motos
    ADD CONSTRAINT motos_pkey PRIMARY KEY (id);


--
-- Name: nfe_dfe_sync nfe_dfe_sync_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfe_dfe_sync
    ADD CONSTRAINT nfe_dfe_sync_pkey PRIMARY KEY (grupo_id);


--
-- Name: nfe_recebidas nfe_recebidas_grupo_id_chave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfe_recebidas
    ADD CONSTRAINT nfe_recebidas_grupo_id_chave_key UNIQUE (grupo_id, chave);


--
-- Name: nfe_recebidas nfe_recebidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfe_recebidas
    ADD CONSTRAINT nfe_recebidas_pkey PRIMARY KEY (id);


--
-- Name: notagateway_config notagateway_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notagateway_config
    ADD CONSTRAINT notagateway_config_pkey PRIMARY KEY (grupo_id);


--
-- Name: notas_fiscais_saida notas_fiscais_saida_id_externo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_fiscais_saida
    ADD CONSTRAINT notas_fiscais_saida_id_externo_key UNIQUE (id_externo);


--
-- Name: notas_fiscais_saida notas_fiscais_saida_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_fiscais_saida
    ADD CONSTRAINT notas_fiscais_saida_pkey PRIMARY KEY (id);


--
-- Name: ordens_servico ordens_servico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordens_servico
    ADD CONSTRAINT ordens_servico_pkey PRIMARY KEY (id);


--
-- Name: origens_venda origens_venda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.origens_venda
    ADD CONSTRAINT origens_venda_pkey PRIMARY KEY (id);


--
-- Name: os_itens os_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.os_itens
    ADD CONSTRAINT os_itens_pkey PRIMARY KEY (id);


--
-- Name: pecas_catalogo pecas_catalogo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pecas_catalogo
    ADD CONSTRAINT pecas_catalogo_pkey PRIMARY KEY (id);


--
-- Name: pedidos_fabrica_alerta pedidos_fabrica_alerta_loja_pedido_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_fabrica_alerta
    ADD CONSTRAINT pedidos_fabrica_alerta_loja_pedido_key UNIQUE (loja_id, numero_pedido);


--
-- Name: pedidos_fabrica_alerta pedidos_fabrica_alerta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_fabrica_alerta
    ADD CONSTRAINT pedidos_fabrica_alerta_pkey PRIMARY KEY (id);


--
-- Name: pedidos_venda pedidos_venda_numero_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_venda
    ADD CONSTRAINT pedidos_venda_numero_unique UNIQUE (numero);


--
-- Name: pedidos_venda pedidos_venda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_venda
    ADD CONSTRAINT pedidos_venda_pkey PRIMARY KEY (id);


--
-- Name: pix_mcp_sync_status pix_mcp_sync_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_mcp_sync_status
    ADD CONSTRAINT pix_mcp_sync_status_pkey PRIMARY KEY (grupo_id);


--
-- Name: pix_recebimentos_mcp pix_recebimentos_mcp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos_mcp
    ADD CONSTRAINT pix_recebimentos_mcp_pkey PRIMARY KEY (id);


--
-- Name: pix_recebimentos_mcp pix_recebimentos_mcp_transacao_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos_mcp
    ADD CONSTRAINT pix_recebimentos_mcp_transacao_id_key UNIQUE (transacao_id);


--
-- Name: pix_recebimentos pix_recebimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos
    ADD CONSTRAINT pix_recebimentos_pkey PRIMARY KEY (id);


--
-- Name: precificacao precificacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precificacao
    ADD CONSTRAINT precificacao_pkey PRIMARY KEY (id);


--
-- Name: premiacao_faixas premiacao_faixas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.premiacao_faixas
    ADD CONSTRAINT premiacao_faixas_pkey PRIMARY KEY (id);


--
-- Name: regras_fiscais_saida regras_fiscais_saida_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_fiscais_saida
    ADD CONSTRAINT regras_fiscais_saida_pkey PRIMARY KEY (grupo_id);


--
-- Name: reservas reservas_numero_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_numero_unique UNIQUE (numero);


--
-- Name: reservas reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_pkey PRIMARY KEY (id);


--
-- Name: servicos_catalogo servicos_catalogo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos_catalogo
    ADD CONSTRAINT servicos_catalogo_pkey PRIMARY KEY (id);


--
-- Name: simulador_precos simulador_precos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.simulador_precos
    ADD CONSTRAINT simulador_precos_pkey PRIMARY KEY (id);


--
-- Name: transferencias transferencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias
    ADD CONSTRAINT transferencias_pkey PRIMARY KEY (id);


--
-- Name: usuarios_dados usuarios_dados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_dados
    ADD CONSTRAINT usuarios_dados_pkey PRIMARY KEY (usuario_id);


--
-- Name: usuarios usuarios_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_unique UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: veiculos_historico veiculos_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculos_historico
    ADD CONSTRAINT veiculos_historico_pkey PRIMARY KEY (id);


--
-- Name: vendas vendas_numero_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_numero_unique UNIQUE (numero);


--
-- Name: vendas_pecas_itens vendas_pecas_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pecas_itens
    ADD CONSTRAINT vendas_pecas_itens_pkey PRIMARY KEY (id);


--
-- Name: vendas_pecas vendas_pecas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pecas
    ADD CONSTRAINT vendas_pecas_pkey PRIMARY KEY (id);


--
-- Name: vendas vendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_pkey PRIMARY KEY (id);


--
-- Name: assinatura_codigos_documento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assinatura_codigos_documento_idx ON public.assinatura_codigos USING btree (documento_id, criado_em DESC);


--
-- Name: assinatura_eventos_documento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assinatura_eventos_documento_idx ON public.assinatura_eventos USING btree (documento_id, criado_em);


--
-- Name: beneficiarios_despesa_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX beneficiarios_despesa_unico ON public.beneficiarios_despesa USING btree (grupo_id, nome);


--
-- Name: calendario_categorias_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendario_categorias_grupo_idx ON public.calendario_categorias USING btree (grupo_id);


--
-- Name: calendario_eventos_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendario_eventos_grupo_idx ON public.calendario_eventos USING btree (grupo_id, data_inicio);


--
-- Name: conciliacoes_venda_conciliado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conciliacoes_venda_conciliado_idx ON public.conciliacoes_cartao USING btree (venda_id, conciliado);


--
-- Name: contas_pagar_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contas_pagar_grupo_idx ON public.contas_pagar USING btree (grupo_id, ativo);


--
-- Name: contas_pagar_ocorrencia_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contas_pagar_ocorrencia_unica ON public.contas_pagar_ocorrencias USING btree (conta_id, competencia);


--
-- Name: contas_pagar_ocorrencias_venc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contas_pagar_ocorrencias_venc_idx ON public.contas_pagar_ocorrencias USING btree (vencimento, pago);


--
-- Name: cupons_revisao_grupo_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cupons_revisao_grupo_status_idx ON public.cupons_revisao USING btree (grupo_id, status);


--
-- Name: cupons_revisao_os_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cupons_revisao_os_idx ON public.cupons_revisao USING btree (os_id);


--
-- Name: documentos_assinatura_grupo_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documentos_assinatura_grupo_status_idx ON public.documentos_assinatura USING btree (grupo_id, status);


--
-- Name: documentos_assinatura_venda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documentos_assinatura_venda_idx ON public.documentos_assinatura USING btree (venda_id);


--
-- Name: documentos_assinatura_vivo_unq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX documentos_assinatura_vivo_unq ON public.documentos_assinatura USING btree (venda_id, tipo) WHERE (status = ANY (ARRAY['pendente'::text, 'visualizado'::text]));


--
-- Name: favorecidos_nao_operacionais_grupo_nome_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX favorecidos_nao_operacionais_grupo_nome_key ON public.favorecidos_nao_operacionais USING btree (grupo_id, lower(nome_padrao)) WHERE (nome_padrao IS NOT NULL);


--
-- Name: folha_adiantamentos_mes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folha_adiantamentos_mes_idx ON public.folha_adiantamentos USING btree (mes, loja_id);


--
-- Name: folha_ajustes_base_loja_mes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folha_ajustes_base_loja_mes_idx ON public.folha_ajustes_base USING btree (loja_id, mes);


--
-- Name: folha_regras_comissao_usuario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folha_regras_comissao_usuario_idx ON public.folha_regras_comissao USING btree (usuario_id);


--
-- Name: folha_valores_reais_pessoa_mes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX folha_valores_reais_pessoa_mes_idx ON public.folha_valores_reais USING btree (usuario_id, mes);


--
-- Name: garantias_data_fim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX garantias_data_fim_idx ON public.garantias USING btree (data_fim);


--
-- Name: garantias_status_loja_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX garantias_status_loja_idx ON public.garantias USING btree (status, loja_id);


--
-- Name: holerites_pessoa_mes_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX holerites_pessoa_mes_tipo_idx ON public.holerites USING btree (usuario_id, mes, tipo);


--
-- Name: idx_agendamentos_loja_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_loja_data ON public.agendamentos USING btree (loja_id, data_hora_inicio);


--
-- Name: idx_agendamentos_mecanico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_mecanico ON public.agendamentos USING btree (mecanico_id, data_hora_inicio);


--
-- Name: idx_agendamentos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_status ON public.agendamentos USING btree (status);


--
-- Name: idx_conciliacoes_cartao_conciliado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conciliacoes_cartao_conciliado ON public.conciliacoes_cartao USING btree (conciliado) WHERE (conciliado = false);


--
-- Name: idx_conciliacoes_cartao_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conciliacoes_cartao_data ON public.conciliacoes_cartao USING btree (data_transacao);


--
-- Name: idx_conciliacoes_cartao_nsu; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conciliacoes_cartao_nsu ON public.conciliacoes_cartao USING btree (operadora, nsu) WHERE (nsu IS NOT NULL);


--
-- Name: idx_conciliacoes_cartao_operadora; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conciliacoes_cartao_operadora ON public.conciliacoes_cartao USING btree (operadora);


--
-- Name: idx_conciliacoes_venda_conciliado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conciliacoes_venda_conciliado ON public.conciliacoes_cartao USING btree (venda_id, conciliado);


--
-- Name: idx_conciliacoes_venda_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conciliacoes_venda_id ON public.conciliacoes_cartao USING btree (venda_id);


--
-- Name: idx_garantias_data_fim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garantias_data_fim ON public.garantias USING btree (data_fim);


--
-- Name: idx_garantias_status_loja; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garantias_status_loja ON public.garantias USING btree (status, loja_id);


--
-- Name: idx_kommo_atividade_dia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kommo_atividade_dia ON public.kommo_atividade_diaria USING btree (dia);


--
-- Name: idx_kommo_leads_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kommo_leads_criado ON public.kommo_leads USING btree (criado_em);


--
-- Name: idx_kommo_leads_fechado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kommo_leads_fechado ON public.kommo_leads USING btree (fechado_em);


--
-- Name: idx_kommo_leads_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kommo_leads_user ON public.kommo_leads USING btree (kommo_user_id);


--
-- Name: idx_lancamentos_caixa_os_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_caixa_os_id ON public.lancamentos_caixa USING btree (os_id);


--
-- Name: idx_motos_disponibilidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motos_disponibilidade ON public.motos USING btree (disponibilidade);


--
-- Name: idx_motos_loja_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motos_loja_id ON public.motos USING btree (loja_id);


--
-- Name: idx_motos_modelo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motos_modelo_id ON public.motos USING btree (modelo_id);


--
-- Name: idx_motos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motos_status ON public.motos USING btree (status);


--
-- Name: idx_ordens_servico_agendamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordens_servico_agendamento ON public.ordens_servico USING btree (agendamento_id);


--
-- Name: idx_ordens_servico_chassi_os; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordens_servico_chassi_os ON public.ordens_servico USING btree (chassi_os) WHERE (chassi_os IS NOT NULL);


--
-- Name: idx_os_data_abertura; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_os_data_abertura ON public.ordens_servico USING btree (data_abertura);


--
-- Name: idx_os_mecanico_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_os_mecanico_id ON public.ordens_servico USING btree (mecanico_id);


--
-- Name: idx_os_status_loja; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_os_status_loja ON public.ordens_servico USING btree (status, loja_id);


--
-- Name: idx_reservas_moto_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_moto_id ON public.reservas USING btree (moto_id);


--
-- Name: idx_reservas_moto_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_moto_status ON public.reservas USING btree (moto_id, status);


--
-- Name: idx_reservas_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_status ON public.reservas USING btree (status);


--
-- Name: idx_transferencias_loja_destino; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transferencias_loja_destino ON public.transferencias USING btree (loja_destino_id);


--
-- Name: idx_transferencias_loja_origem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transferencias_loja_origem ON public.transferencias USING btree (loja_origem_id);


--
-- Name: idx_transferencias_moto_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transferencias_moto_id ON public.transferencias USING btree (moto_id);


--
-- Name: idx_transferencias_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transferencias_status ON public.transferencias USING btree (status);


--
-- Name: idx_veiculos_historico_chassi; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_veiculos_historico_chassi ON public.veiculos_historico USING btree (chassi);


--
-- Name: idx_veiculos_historico_motor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_veiculos_historico_motor ON public.veiculos_historico USING btree (numero_motor) WHERE (numero_motor IS NOT NULL);


--
-- Name: idx_veiculos_historico_nf_entrada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_veiculos_historico_nf_entrada ON public.veiculos_historico USING btree (nf_entrada) WHERE (nf_entrada IS NOT NULL);


--
-- Name: idx_vendas_data_loja; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_data_loja ON public.vendas USING btree (data_venda, loja_id);


--
-- Name: idx_vendas_data_venda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_data_venda ON public.vendas USING btree (data_venda);


--
-- Name: idx_vendas_loja_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_loja_id ON public.vendas USING btree (loja_id);


--
-- Name: idx_vendas_vendedor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendas_vendedor_id ON public.vendas USING btree (vendedor_id);


--
-- Name: importacoes_cartao_fila_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX importacoes_cartao_fila_idx ON public.importacoes_cartao USING btree (grupo_id, status, criado_em);


--
-- Name: kommo_leads_criado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kommo_leads_criado_em_idx ON public.kommo_leads USING btree (criado_em);


--
-- Name: kommo_leads_source_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kommo_leads_source_id_idx ON public.kommo_leads USING btree (source_id);


--
-- Name: kommo_tarefas_abertas_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kommo_tarefas_abertas_lead_idx ON public.kommo_tarefas_abertas USING btree (lead_id);


--
-- Name: marketing_investimento_grupo_mes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_investimento_grupo_mes_idx ON public.marketing_investimento USING btree (grupo_id, mes);


--
-- Name: marketing_investimento_unq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketing_investimento_unq ON public.marketing_investimento USING btree (grupo_id, mes, COALESCE(pipeline_id, ''::text), plataforma);


--
-- Name: metas_loja_periodo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX metas_loja_periodo_idx ON public.metas_loja USING btree (ano, mes);


--
-- Name: modelo_apelidos_modelo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modelo_apelidos_modelo_idx ON public.modelo_apelidos USING btree (modelo_id);


--
-- Name: motos_disponibilidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX motos_disponibilidade_idx ON public.motos USING btree (disponibilidade);


--
-- Name: motos_fiscal_emitente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX motos_fiscal_emitente_idx ON public.motos_fiscal USING btree (emitente_cnpj);


--
-- Name: motos_loja_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX motos_loja_id_idx ON public.motos USING btree (loja_id);


--
-- Name: motos_modelo_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX motos_modelo_id_idx ON public.motos USING btree (modelo_id);


--
-- Name: motos_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX motos_status_idx ON public.motos USING btree (status);


--
-- Name: nfe_recebidas_grupo_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nfe_recebidas_grupo_data_idx ON public.nfe_recebidas USING btree (grupo_id, data_emissao DESC);


--
-- Name: notas_fiscais_saida_uma_viva_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notas_fiscais_saida_uma_viva_idx ON public.notas_fiscais_saida USING btree (venda_id) WHERE ((ambiente = 'Producao'::text) AND (status = ANY (ARRAY['Enviando'::text, 'Processando'::text, 'Autorizada'::text])));


--
-- Name: notas_fiscais_saida_venda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notas_fiscais_saida_venda_idx ON public.notas_fiscais_saida USING btree (venda_id, criado_em DESC);


--
-- Name: origens_venda_nome_unq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX origens_venda_nome_unq ON public.origens_venda USING btree (grupo_id, lower(TRIM(BOTH FROM nome)));


--
-- Name: os_data_abertura_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX os_data_abertura_idx ON public.ordens_servico USING btree (data_abertura);


--
-- Name: os_itens_os_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX os_itens_os_id_idx ON public.os_itens USING btree (os_id);


--
-- Name: os_mecanico_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX os_mecanico_id_idx ON public.ordens_servico USING btree (mecanico_id);


--
-- Name: os_status_loja_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX os_status_loja_idx ON public.ordens_servico USING btree (status, loja_id);


--
-- Name: pedidos_fabrica_alerta_pendentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_fabrica_alerta_pendentes_idx ON public.pedidos_fabrica_alerta USING btree (grupo_id) WHERE (resolvido_em IS NULL);


--
-- Name: pedidos_venda_moto_pendente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pedidos_venda_moto_pendente_idx ON public.pedidos_venda USING btree (moto_id) WHERE (status = 'pendente'::public.pedido_status);


--
-- Name: transferencias_loja_destino_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transferencias_loja_destino_idx ON public.transferencias USING btree (loja_destino_id);


--
-- Name: transferencias_loja_origem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transferencias_loja_origem_idx ON public.transferencias USING btree (loja_origem_id);


--
-- Name: transferencias_moto_pendente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transferencias_moto_pendente_idx ON public.transferencias USING btree (moto_id) WHERE (status = 'pendente'::public.transferencia_status);


--
-- Name: transferencias_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transferencias_status_idx ON public.transferencias USING btree (status);


--
-- Name: vendas_data_loja_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_data_loja_idx ON public.vendas USING btree (data_venda, loja_id);


--
-- Name: vendas_data_venda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_data_venda_idx ON public.vendas USING btree (data_venda);


--
-- Name: vendas_loja_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_loja_id_idx ON public.vendas USING btree (loja_id);


--
-- Name: vendas_origem_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_origem_id_idx ON public.vendas USING btree (origem_id);


--
-- Name: vendas_vendedor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendas_vendedor_id_idx ON public.vendas USING btree (vendedor_id);


--
-- Name: vendas trg_set_venda_numero; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_venda_numero BEFORE INSERT ON public.vendas FOR EACH ROW EXECUTE FUNCTION public.fn_set_venda_numero();


--
-- Name: agendamentos agendamentos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: agendamentos agendamentos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id);


--
-- Name: agendamentos agendamentos_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: agendamentos agendamentos_mecanico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_mecanico_id_fkey FOREIGN KEY (mecanico_id) REFERENCES public.usuarios(id);


--
-- Name: agendamentos agendamentos_os_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_os_id_fkey FOREIGN KEY (os_id) REFERENCES public.ordens_servico(id);


--
-- Name: aprovacoes_venda aprovacoes_venda_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprovacoes_venda
    ADD CONSTRAINT aprovacoes_venda_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: aprovacoes_venda aprovacoes_venda_moto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprovacoes_venda
    ADD CONSTRAINT aprovacoes_venda_moto_id_fkey FOREIGN KEY (moto_id) REFERENCES public.motos(id);


--
-- Name: aprovacoes_venda aprovacoes_venda_os_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprovacoes_venda
    ADD CONSTRAINT aprovacoes_venda_os_id_fkey FOREIGN KEY (os_id) REFERENCES public.ordens_servico(id);


--
-- Name: aprovacoes_venda aprovacoes_venda_respondido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprovacoes_venda
    ADD CONSTRAINT aprovacoes_venda_respondido_por_fkey FOREIGN KEY (respondido_por) REFERENCES public.usuarios(id);


--
-- Name: aprovacoes_venda aprovacoes_venda_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprovacoes_venda
    ADD CONSTRAINT aprovacoes_venda_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id);


--
-- Name: assinatura_codigos assinatura_codigos_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assinatura_codigos
    ADD CONSTRAINT assinatura_codigos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos_assinatura(id) ON DELETE CASCADE;


--
-- Name: assinatura_eventos assinatura_eventos_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assinatura_eventos
    ADD CONSTRAINT assinatura_eventos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos_assinatura(id) ON DELETE CASCADE;


--
-- Name: beneficiarios_despesa beneficiarios_despesa_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficiarios_despesa
    ADD CONSTRAINT beneficiarios_despesa_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE;


--
-- Name: bling_config bling_config_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_config
    ADD CONSTRAINT bling_config_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: calendario_categorias calendario_categorias_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_categorias
    ADD CONSTRAINT calendario_categorias_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: calendario_evento_usuarios calendario_evento_usuarios_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_evento_usuarios
    ADD CONSTRAINT calendario_evento_usuarios_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.calendario_eventos(id) ON DELETE CASCADE;


--
-- Name: calendario_evento_usuarios calendario_evento_usuarios_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_evento_usuarios
    ADD CONSTRAINT calendario_evento_usuarios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: calendario_eventos calendario_eventos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_eventos
    ADD CONSTRAINT calendario_eventos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.calendario_categorias(id);


--
-- Name: calendario_eventos calendario_eventos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_eventos
    ADD CONSTRAINT calendario_eventos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id);


--
-- Name: calendario_eventos calendario_eventos_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_eventos
    ADD CONSTRAINT calendario_eventos_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: calendario_eventos calendario_eventos_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_eventos
    ADD CONSTRAINT calendario_eventos_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: certificados_digitais certificados_digitais_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados_digitais
    ADD CONSTRAINT certificados_digitais_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE;


--
-- Name: comunicados comunicados_criado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunicados
    ADD CONSTRAINT comunicados_criado_por_id_fkey FOREIGN KEY (criado_por_id) REFERENCES public.usuarios(id);


--
-- Name: comunicados comunicados_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunicados
    ADD CONSTRAINT comunicados_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: comunicados_lidos comunicados_lidos_comunicado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunicados_lidos
    ADD CONSTRAINT comunicados_lidos_comunicado_id_fkey FOREIGN KEY (comunicado_id) REFERENCES public.comunicados(id) ON DELETE CASCADE;


--
-- Name: comunicados_lidos comunicados_lidos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunicados_lidos
    ADD CONSTRAINT comunicados_lidos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: conciliacoes_cartao conciliacoes_cartao_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacoes_cartao
    ADD CONSTRAINT conciliacoes_cartao_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: conciliacoes_cartao conciliacoes_cartao_os_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacoes_cartao
    ADD CONSTRAINT conciliacoes_cartao_os_id_fkey FOREIGN KEY (os_id) REFERENCES public.ordens_servico(id);


--
-- Name: conciliacoes_cartao conciliacoes_cartao_peca_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacoes_cartao
    ADD CONSTRAINT conciliacoes_cartao_peca_venda_id_fkey FOREIGN KEY (peca_venda_id) REFERENCES public.vendas_pecas(id);


--
-- Name: conciliacoes_cartao conciliacoes_cartao_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacoes_cartao
    ADD CONSTRAINT conciliacoes_cartao_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE SET NULL;


--
-- Name: configuracao_taxas configuracao_taxas_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracao_taxas
    ADD CONSTRAINT configuracao_taxas_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: contas_pagar contas_pagar_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_pagar
    ADD CONSTRAINT contas_pagar_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id);


--
-- Name: contas_pagar contas_pagar_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_pagar
    ADD CONSTRAINT contas_pagar_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: contas_pagar contas_pagar_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_pagar
    ADD CONSTRAINT contas_pagar_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: contas_pagar_ocorrencias contas_pagar_ocorrencias_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_pagar_ocorrencias
    ADD CONSTRAINT contas_pagar_ocorrencias_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas_pagar(id) ON DELETE CASCADE;


--
-- Name: contas_pagar_ocorrencias contas_pagar_ocorrencias_pago_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_pagar_ocorrencias
    ADD CONSTRAINT contas_pagar_ocorrencias_pago_por_fkey FOREIGN KEY (pago_por) REFERENCES public.usuarios(id);


--
-- Name: cupons_revisao cupons_revisao_cancelado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons_revisao
    ADD CONSTRAINT cupons_revisao_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.usuarios(id);


--
-- Name: cupons_revisao cupons_revisao_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons_revisao
    ADD CONSTRAINT cupons_revisao_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: cupons_revisao cupons_revisao_emitido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons_revisao
    ADD CONSTRAINT cupons_revisao_emitido_por_fkey FOREIGN KEY (emitido_por) REFERENCES public.usuarios(id);


--
-- Name: cupons_revisao cupons_revisao_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons_revisao
    ADD CONSTRAINT cupons_revisao_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: cupons_revisao cupons_revisao_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons_revisao
    ADD CONSTRAINT cupons_revisao_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: cupons_revisao cupons_revisao_moto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons_revisao
    ADD CONSTRAINT cupons_revisao_moto_id_fkey FOREIGN KEY (moto_id) REFERENCES public.motos(id);


--
-- Name: cupons_revisao cupons_revisao_os_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons_revisao
    ADD CONSTRAINT cupons_revisao_os_id_fkey FOREIGN KEY (os_id) REFERENCES public.ordens_servico(id);


--
-- Name: demandas demandas_loja_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demandas
    ADD CONSTRAINT demandas_loja_id_lojas_id_fk FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: demandas demandas_modelo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demandas
    ADD CONSTRAINT demandas_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES public.modelos(id);


--
-- Name: demandas demandas_solicitante_id_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demandas
    ADD CONSTRAINT demandas_solicitante_id_usuarios_id_fk FOREIGN KEY (solicitante_id) REFERENCES public.usuarios(id);


--
-- Name: demandas demandas_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demandas
    ADD CONSTRAINT demandas_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id);


--
-- Name: despesas despesas_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: despesas despesas_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: despesas_of_sync_status despesas_of_sync_status_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas_of_sync_status
    ADD CONSTRAINT despesas_of_sync_status_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: despesas_open_finance despesas_open_finance_despesa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas_open_finance
    ADD CONSTRAINT despesas_open_finance_despesa_id_fkey FOREIGN KEY (despesa_id) REFERENCES public.despesas(id);


--
-- Name: despesas_open_finance despesas_open_finance_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas_open_finance
    ADD CONSTRAINT despesas_open_finance_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: despesas_open_finance despesas_open_finance_lancado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas_open_finance
    ADD CONSTRAINT despesas_open_finance_lancado_por_id_fkey FOREIGN KEY (lancado_por_id) REFERENCES public.usuarios(id);


--
-- Name: despesas_open_finance despesas_open_finance_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas_open_finance
    ADD CONSTRAINT despesas_open_finance_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: despesas despesas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: documentos_assinatura documentos_assinatura_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura
    ADD CONSTRAINT documentos_assinatura_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id);


--
-- Name: documentos_assinatura documentos_assinatura_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura
    ADD CONSTRAINT documentos_assinatura_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: documentos_assinatura documentos_assinatura_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura
    ADD CONSTRAINT documentos_assinatura_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: documentos_assinatura documentos_assinatura_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura
    ADD CONSTRAINT documentos_assinatura_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id);


--
-- Name: documentos_assinatura documentos_assinatura_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_assinatura
    ADD CONSTRAINT documentos_assinatura_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id);


--
-- Name: fabrica_sync_loja fabrica_sync_loja_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fabrica_sync_loja
    ADD CONSTRAINT fabrica_sync_loja_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id) ON DELETE CASCADE;


--
-- Name: favorecidos_nao_operacionais favorecidos_nao_operacionais_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorecidos_nao_operacionais
    ADD CONSTRAINT favorecidos_nao_operacionais_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE;


--
-- Name: folha_adiantamentos folha_adiantamentos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_adiantamentos
    ADD CONSTRAINT folha_adiantamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id);


--
-- Name: folha_adiantamentos folha_adiantamentos_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_adiantamentos
    ADD CONSTRAINT folha_adiantamentos_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: folha_adiantamentos folha_adiantamentos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_adiantamentos
    ADD CONSTRAINT folha_adiantamentos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: folha_ajustes_base folha_ajustes_base_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_ajustes_base
    ADD CONSTRAINT folha_ajustes_base_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id);


--
-- Name: folha_ajustes_base folha_ajustes_base_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_ajustes_base
    ADD CONSTRAINT folha_ajustes_base_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: folha_ajustes_base folha_ajustes_base_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_ajustes_base
    ADD CONSTRAINT folha_ajustes_base_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: folha_regras_comissao folha_regras_comissao_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_regras_comissao
    ADD CONSTRAINT folha_regras_comissao_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id);


--
-- Name: folha_regras_comissao folha_regras_comissao_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_regras_comissao
    ADD CONSTRAINT folha_regras_comissao_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: folha_valores_reais folha_valores_reais_atualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_valores_reais
    ADD CONSTRAINT folha_valores_reais_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES public.usuarios(id);


--
-- Name: folha_valores_reais folha_valores_reais_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folha_valores_reais
    ADD CONSTRAINT folha_valores_reais_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: funcionarios_config funcionarios_config_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcionarios_config
    ADD CONSTRAINT funcionarios_config_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: garantias garantias_encerrada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias
    ADD CONSTRAINT garantias_encerrada_por_fkey FOREIGN KEY (encerrada_por) REFERENCES public.usuarios(id);


--
-- Name: garantias garantias_fabrica_conta_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias
    ADD CONSTRAINT garantias_fabrica_conta_loja_id_fkey FOREIGN KEY (fabrica_conta_loja_id) REFERENCES public.lojas(id);


--
-- Name: garantias garantias_loja_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias
    ADD CONSTRAINT garantias_loja_id_lojas_id_fk FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: garantias garantias_moto_id_motos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias
    ADD CONSTRAINT garantias_moto_id_motos_id_fk FOREIGN KEY (moto_id) REFERENCES public.motos(id);


--
-- Name: garantias garantias_os_id_ordens_servico_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantias
    ADD CONSTRAINT garantias_os_id_ordens_servico_id_fk FOREIGN KEY (os_id) REFERENCES public.ordens_servico(id);


--
-- Name: historico_estoque historico_estoque_loja_destino_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_estoque
    ADD CONSTRAINT historico_estoque_loja_destino_id_lojas_id_fk FOREIGN KEY (loja_destino_id) REFERENCES public.lojas(id);


--
-- Name: historico_estoque historico_estoque_loja_origem_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_estoque
    ADD CONSTRAINT historico_estoque_loja_origem_id_lojas_id_fk FOREIGN KEY (loja_origem_id) REFERENCES public.lojas(id);


--
-- Name: historico_estoque historico_estoque_moto_id_motos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_estoque
    ADD CONSTRAINT historico_estoque_moto_id_motos_id_fk FOREIGN KEY (moto_id) REFERENCES public.motos(id);


--
-- Name: historico_estoque historico_estoque_usuario_id_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_estoque
    ADD CONSTRAINT historico_estoque_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: holerites holerites_enviado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holerites
    ADD CONSTRAINT holerites_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES public.usuarios(id);


--
-- Name: holerites holerites_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holerites
    ADD CONSTRAINT holerites_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: importacoes_cartao importacoes_cartao_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.importacoes_cartao
    ADD CONSTRAINT importacoes_cartao_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: importacoes_cartao importacoes_cartao_solicitado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.importacoes_cartao
    ADD CONSTRAINT importacoes_cartao_solicitado_por_fkey FOREIGN KEY (solicitado_por) REFERENCES public.usuarios(id);


--
-- Name: kommo_pipeline_grupo kommo_pipeline_grupo_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_pipeline_grupo
    ADD CONSTRAINT kommo_pipeline_grupo_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE SET NULL;


--
-- Name: kommo_user_map kommo_user_map_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kommo_user_map
    ADD CONSTRAINT kommo_user_map_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: lancamentos_caixa lancamentos_caixa_aprovado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_caixa
    ADD CONSTRAINT lancamentos_caixa_aprovado_por_id_fkey FOREIGN KEY (aprovado_por_id) REFERENCES public.usuarios(id);


--
-- Name: lancamentos_caixa lancamentos_caixa_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_caixa
    ADD CONSTRAINT lancamentos_caixa_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: lancamentos_caixa lancamentos_caixa_os_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_caixa
    ADD CONSTRAINT lancamentos_caixa_os_id_fkey FOREIGN KEY (os_id) REFERENCES public.ordens_servico(id);


--
-- Name: lancamentos_caixa lancamentos_caixa_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_caixa
    ADD CONSTRAINT lancamentos_caixa_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: lancamentos_caixa lancamentos_caixa_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos_caixa
    ADD CONSTRAINT lancamentos_caixa_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id);


--
-- Name: lojas lojas_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lojas
    ADD CONSTRAINT lojas_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: marketing_investimento marketing_investimento_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_investimento
    ADD CONSTRAINT marketing_investimento_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: metas_loja metas_loja_atualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas_loja
    ADD CONSTRAINT metas_loja_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES public.usuarios(id);


--
-- Name: metas_loja metas_loja_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas_loja
    ADD CONSTRAINT metas_loja_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: modelo_apelidos modelo_apelidos_modelo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelo_apelidos
    ADD CONSTRAINT modelo_apelidos_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES public.modelos(id) ON DELETE CASCADE;


--
-- Name: modelo_bling_codigos modelo_bling_codigos_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelo_bling_codigos
    ADD CONSTRAINT modelo_bling_codigos_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: modelo_bling_codigos modelo_bling_codigos_modelo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelo_bling_codigos
    ADD CONSTRAINT modelo_bling_codigos_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES public.modelos(id);


--
-- Name: motos_fiscal motos_fiscal_moto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motos_fiscal
    ADD CONSTRAINT motos_fiscal_moto_id_fkey FOREIGN KEY (moto_id) REFERENCES public.motos(id) ON DELETE CASCADE;


--
-- Name: motos motos_loja_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motos
    ADD CONSTRAINT motos_loja_id_lojas_id_fk FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: motos motos_modelo_id_modelos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motos
    ADD CONSTRAINT motos_modelo_id_modelos_id_fk FOREIGN KEY (modelo_id) REFERENCES public.modelos(id);


--
-- Name: motos motos_responsavel_montagem_id_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motos
    ADD CONSTRAINT motos_responsavel_montagem_id_usuarios_id_fk FOREIGN KEY (responsavel_montagem_id) REFERENCES public.usuarios(id);


--
-- Name: nfe_dfe_sync nfe_dfe_sync_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfe_dfe_sync
    ADD CONSTRAINT nfe_dfe_sync_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE;


--
-- Name: nfe_recebidas nfe_recebidas_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfe_recebidas
    ADD CONSTRAINT nfe_recebidas_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE;


--
-- Name: notagateway_config notagateway_config_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notagateway_config
    ADD CONSTRAINT notagateway_config_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE;


--
-- Name: notas_fiscais_saida notas_fiscais_saida_emitida_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_fiscais_saida
    ADD CONSTRAINT notas_fiscais_saida_emitida_por_fkey FOREIGN KEY (emitida_por) REFERENCES public.usuarios(id);


--
-- Name: notas_fiscais_saida notas_fiscais_saida_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_fiscais_saida
    ADD CONSTRAINT notas_fiscais_saida_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: notas_fiscais_saida notas_fiscais_saida_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_fiscais_saida
    ADD CONSTRAINT notas_fiscais_saida_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE CASCADE;


--
-- Name: ordens_servico ordens_servico_aberta_por_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordens_servico
    ADD CONSTRAINT ordens_servico_aberta_por_usuarios_id_fk FOREIGN KEY (aberta_por) REFERENCES public.usuarios(id);


--
-- Name: ordens_servico ordens_servico_agendamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordens_servico
    ADD CONSTRAINT ordens_servico_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id);


--
-- Name: ordens_servico ordens_servico_cancelada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordens_servico
    ADD CONSTRAINT ordens_servico_cancelada_por_fkey FOREIGN KEY (cancelada_por) REFERENCES public.usuarios(id);


--
-- Name: ordens_servico ordens_servico_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordens_servico
    ADD CONSTRAINT ordens_servico_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: ordens_servico ordens_servico_loja_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordens_servico
    ADD CONSTRAINT ordens_servico_loja_id_lojas_id_fk FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: ordens_servico ordens_servico_mecanico_id_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordens_servico
    ADD CONSTRAINT ordens_servico_mecanico_id_usuarios_id_fk FOREIGN KEY (mecanico_id) REFERENCES public.usuarios(id);


--
-- Name: ordens_servico ordens_servico_moto_id_motos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordens_servico
    ADD CONSTRAINT ordens_servico_moto_id_motos_id_fk FOREIGN KEY (moto_id) REFERENCES public.motos(id);


--
-- Name: origens_venda origens_venda_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.origens_venda
    ADD CONSTRAINT origens_venda_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: os_itens os_itens_os_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.os_itens
    ADD CONSTRAINT os_itens_os_id_fkey FOREIGN KEY (os_id) REFERENCES public.ordens_servico(id) ON DELETE CASCADE;


--
-- Name: os_itens os_itens_peca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.os_itens
    ADD CONSTRAINT os_itens_peca_id_fkey FOREIGN KEY (peca_id) REFERENCES public.pecas_catalogo(id);


--
-- Name: os_itens os_itens_servico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.os_itens
    ADD CONSTRAINT os_itens_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES public.servicos_catalogo(id);


--
-- Name: pedidos_fabrica_alerta pedidos_fabrica_alerta_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_fabrica_alerta
    ADD CONSTRAINT pedidos_fabrica_alerta_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE;


--
-- Name: pedidos_fabrica_alerta pedidos_fabrica_alerta_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_fabrica_alerta
    ADD CONSTRAINT pedidos_fabrica_alerta_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id) ON DELETE CASCADE;


--
-- Name: pedidos_venda pedidos_venda_loja_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_venda
    ADD CONSTRAINT pedidos_venda_loja_id_lojas_id_fk FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: pedidos_venda pedidos_venda_moto_id_motos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_venda
    ADD CONSTRAINT pedidos_venda_moto_id_motos_id_fk FOREIGN KEY (moto_id) REFERENCES public.motos(id);


--
-- Name: pedidos_venda pedidos_venda_vendedor_id_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_venda
    ADD CONSTRAINT pedidos_venda_vendedor_id_usuarios_id_fk FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id);


--
-- Name: pix_mcp_sync_status pix_mcp_sync_status_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_mcp_sync_status
    ADD CONSTRAINT pix_mcp_sync_status_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: pix_recebimentos pix_recebimentos_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos
    ADD CONSTRAINT pix_recebimentos_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: pix_recebimentos_mcp pix_recebimentos_mcp_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos_mcp
    ADD CONSTRAINT pix_recebimentos_mcp_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: pix_recebimentos_mcp pix_recebimentos_mcp_lancado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos_mcp
    ADD CONSTRAINT pix_recebimentos_mcp_lancado_por_id_fkey FOREIGN KEY (lancado_por_id) REFERENCES public.usuarios(id);


--
-- Name: pix_recebimentos_mcp pix_recebimentos_mcp_os_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos_mcp
    ADD CONSTRAINT pix_recebimentos_mcp_os_id_fkey FOREIGN KEY (os_id) REFERENCES public.ordens_servico(id);


--
-- Name: pix_recebimentos_mcp pix_recebimentos_mcp_peca_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos_mcp
    ADD CONSTRAINT pix_recebimentos_mcp_peca_venda_id_fkey FOREIGN KEY (peca_venda_id) REFERENCES public.vendas_pecas(id);


--
-- Name: pix_recebimentos_mcp pix_recebimentos_mcp_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos_mcp
    ADD CONSTRAINT pix_recebimentos_mcp_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos_venda(id);


--
-- Name: pix_recebimentos_mcp pix_recebimentos_mcp_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos_mcp
    ADD CONSTRAINT pix_recebimentos_mcp_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id);


--
-- Name: pix_recebimentos pix_recebimentos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos
    ADD CONSTRAINT pix_recebimentos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos_venda(id);


--
-- Name: pix_recebimentos pix_recebimentos_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_recebimentos
    ADD CONSTRAINT pix_recebimentos_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id);


--
-- Name: precificacao precificacao_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precificacao
    ADD CONSTRAINT precificacao_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: premiacao_faixas premiacao_faixas_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.premiacao_faixas
    ADD CONSTRAINT premiacao_faixas_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id);


--
-- Name: regras_fiscais_saida regras_fiscais_saida_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_fiscais_saida
    ADD CONSTRAINT regras_fiscais_saida_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE CASCADE;


--
-- Name: reservas reservas_cancelada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_cancelada_por_fkey FOREIGN KEY (cancelada_por) REFERENCES public.usuarios(id);


--
-- Name: reservas reservas_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: reservas reservas_moto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_moto_id_fkey FOREIGN KEY (moto_id) REFERENCES public.motos(id);


--
-- Name: reservas reservas_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id);


--
-- Name: transferencias transferencias_loja_destino_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias
    ADD CONSTRAINT transferencias_loja_destino_id_lojas_id_fk FOREIGN KEY (loja_destino_id) REFERENCES public.lojas(id);


--
-- Name: transferencias transferencias_loja_origem_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias
    ADD CONSTRAINT transferencias_loja_origem_id_lojas_id_fk FOREIGN KEY (loja_origem_id) REFERENCES public.lojas(id);


--
-- Name: transferencias transferencias_moto_id_motos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias
    ADD CONSTRAINT transferencias_moto_id_motos_id_fk FOREIGN KEY (moto_id) REFERENCES public.motos(id);


--
-- Name: transferencias transferencias_respondido_por_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias
    ADD CONSTRAINT transferencias_respondido_por_usuarios_id_fk FOREIGN KEY (respondido_por) REFERENCES public.usuarios(id);


--
-- Name: transferencias transferencias_solicitado_por_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias
    ADD CONSTRAINT transferencias_solicitado_por_usuarios_id_fk FOREIGN KEY (solicitado_por) REFERENCES public.usuarios(id);


--
-- Name: usuarios_dados usuarios_dados_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_dados
    ADD CONSTRAINT usuarios_dados_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: usuarios usuarios_loja_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_loja_id_lojas_id_fk FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: vendas vendas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: vendas vendas_efetivado_por_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_efetivado_por_usuarios_id_fk FOREIGN KEY (efetivado_por) REFERENCES public.usuarios(id);


--
-- Name: vendas vendas_loja_id_lojas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_loja_id_lojas_id_fk FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: vendas vendas_moto_id_motos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_moto_id_motos_id_fk FOREIGN KEY (moto_id) REFERENCES public.motos(id);


--
-- Name: vendas vendas_nf_liberada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_nf_liberada_por_fkey FOREIGN KEY (nf_liberada_por) REFERENCES public.usuarios(id);


--
-- Name: vendas vendas_origem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_origem_id_fkey FOREIGN KEY (origem_id) REFERENCES public.origens_venda(id);


--
-- Name: vendas_pecas vendas_pecas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pecas
    ADD CONSTRAINT vendas_pecas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: vendas_pecas_itens vendas_pecas_itens_peca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pecas_itens
    ADD CONSTRAINT vendas_pecas_itens_peca_id_fkey FOREIGN KEY (peca_id) REFERENCES public.pecas_catalogo(id);


--
-- Name: vendas_pecas_itens vendas_pecas_itens_venda_peca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pecas_itens
    ADD CONSTRAINT vendas_pecas_itens_venda_peca_id_fkey FOREIGN KEY (venda_peca_id) REFERENCES public.vendas_pecas(id) ON DELETE CASCADE;


--
-- Name: vendas_pecas vendas_pecas_loja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pecas
    ADD CONSTRAINT vendas_pecas_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas(id);


--
-- Name: vendas_pecas vendas_pecas_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas_pecas
    ADD CONSTRAINT vendas_pecas_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id);


--
-- Name: vendas vendas_pedido_venda_id_pedidos_venda_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_pedido_venda_id_pedidos_venda_id_fk FOREIGN KEY (pedido_venda_id) REFERENCES public.pedidos_venda(id);


--
-- Name: vendas vendas_reserva_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES public.reservas(id);


--
-- Name: vendas vendas_vendedor_id_usuarios_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendas
    ADD CONSTRAINT vendas_vendedor_id_usuarios_id_fk FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id);


--
-- Name: configuracao_taxas admin_escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita ON public.configuracao_taxas USING ((( SELECT usuarios.papel
   FROM public.usuarios
  WHERE (usuarios.id = auth.uid())) = ANY (ARRAY['admin_geral'::public.papel, 'admin_socio'::public.papel])));


--
-- Name: precificacao admin_escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita ON public.precificacao USING ((( SELECT usuarios.papel
   FROM public.usuarios
  WHERE (usuarios.id = auth.uid())) = ANY (ARRAY['admin_geral'::public.papel, 'admin_socio'::public.papel])));


--
-- Name: garantias admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.garantias USING (public.is_admin());


--
-- Name: historico_estoque admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.historico_estoque USING (public.is_admin());


--
-- Name: lojas admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.lojas USING (public.is_admin());


--
-- Name: modelos admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.modelos USING (public.is_admin());


--
-- Name: motos admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.motos USING (public.is_admin());


--
-- Name: ordens_servico admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.ordens_servico USING (public.is_admin());


--
-- Name: pedidos_venda admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.pedidos_venda USING (public.is_admin());


--
-- Name: transferencias admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.transferencias USING (public.is_admin());


--
-- Name: usuarios admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.usuarios USING (public.is_admin());


--
-- Name: vendas admin_escrita_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_escrita_total ON public.vendas USING (public.is_admin());


--
-- Name: agendamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: aprovacoes_venda; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aprovacoes_venda ENABLE ROW LEVEL SECURITY;

--
-- Name: assinatura_codigos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assinatura_codigos ENABLE ROW LEVEL SECURITY;

--
-- Name: assinatura_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assinatura_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: beneficiarios_despesa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beneficiarios_despesa ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_config ENABLE ROW LEVEL SECURITY;

--
-- Name: calendario_categorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendario_categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: calendario_evento_usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendario_evento_usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: calendario_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendario_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias_caixa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias_caixa ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias_despesa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias_despesa ENABLE ROW LEVEL SECURITY;

--
-- Name: certificados_digitais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.certificados_digitais ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: comunicados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comunicados ENABLE ROW LEVEL SECURITY;

--
-- Name: comunicados_lidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comunicados_lidos ENABLE ROW LEVEL SECURITY;

--
-- Name: conciliacoes_cartao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conciliacoes_cartao ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracao_taxas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracao_taxas ENABLE ROW LEVEL SECURITY;

--
-- Name: contas_pagar; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;

--
-- Name: contas_pagar_ocorrencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contas_pagar_ocorrencias ENABLE ROW LEVEL SECURITY;

--
-- Name: cupons_revisao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cupons_revisao ENABLE ROW LEVEL SECURITY;

--
-- Name: demandas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.demandas ENABLE ROW LEVEL SECURITY;

--
-- Name: despesas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

--
-- Name: despesas_of_sync_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.despesas_of_sync_status ENABLE ROW LEVEL SECURITY;

--
-- Name: despesas_open_finance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.despesas_open_finance ENABLE ROW LEVEL SECURITY;

--
-- Name: documentos_assinatura; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documentos_assinatura ENABLE ROW LEVEL SECURITY;

--
-- Name: simulador_precos escrita_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY escrita_admin ON public.simulador_precos TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.papel = ANY (ARRAY['admin_geral'::public.papel, 'admin_socio'::public.papel]))))));


--
-- Name: garantias escrita_por_loja_garantias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY escrita_por_loja_garantias ON public.garantias USING (((loja_id = public.get_loja_id()) AND (NOT public.is_admin())));


--
-- Name: motos escrita_por_loja_motos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY escrita_por_loja_motos ON public.motos FOR UPDATE USING (((loja_id = public.get_loja_id()) AND (NOT public.is_admin())));


--
-- Name: ordens_servico escrita_por_loja_os; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY escrita_por_loja_os ON public.ordens_servico USING (((loja_id = public.get_loja_id()) AND (NOT public.is_admin())));


--
-- Name: fabrica_sync_loja; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fabrica_sync_loja ENABLE ROW LEVEL SECURITY;

--
-- Name: favorecidos_nao_operacionais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorecidos_nao_operacionais ENABLE ROW LEVEL SECURITY;

--
-- Name: folha_adiantamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folha_adiantamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: folha_ajustes_base; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folha_ajustes_base ENABLE ROW LEVEL SECURITY;

--
-- Name: folha_regras_comissao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folha_regras_comissao ENABLE ROW LEVEL SECURITY;

--
-- Name: folha_valores_reais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folha_valores_reais ENABLE ROW LEVEL SECURITY;

--
-- Name: funcionarios_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funcionarios_config ENABLE ROW LEVEL SECURITY;

--
-- Name: garantias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.garantias ENABLE ROW LEVEL SECURITY;

--
-- Name: grupos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;

--
-- Name: historico_estoque historico_apenas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY historico_apenas_insert ON public.historico_estoque FOR INSERT WITH CHECK (true);


--
-- Name: historico_estoque; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historico_estoque ENABLE ROW LEVEL SECURITY;

--
-- Name: holerites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holerites ENABLE ROW LEVEL SECURITY;

--
-- Name: importacoes_cartao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.importacoes_cartao ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos_venda inserir_pedido_venda; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inserir_pedido_venda ON public.pedidos_venda FOR INSERT WITH CHECK (((loja_id = public.get_loja_id()) OR public.is_admin()));


--
-- Name: kommo_atividade_diaria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_atividade_diaria ENABLE ROW LEVEL SECURITY;

--
-- Name: kommo_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_config ENABLE ROW LEVEL SECURITY;

--
-- Name: kommo_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: kommo_loss_reasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_loss_reasons ENABLE ROW LEVEL SECURITY;

--
-- Name: kommo_pipeline_grupo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_pipeline_grupo ENABLE ROW LEVEL SECURITY;

--
-- Name: kommo_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: kommo_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: kommo_sync_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_sync_status ENABLE ROW LEVEL SECURITY;

--
-- Name: kommo_tarefas_abertas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_tarefas_abertas ENABLE ROW LEVEL SECURITY;

--
-- Name: kommo_user_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kommo_user_map ENABLE ROW LEVEL SECURITY;

--
-- Name: lancamentos_caixa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lancamentos_caixa ENABLE ROW LEVEL SECURITY;

--
-- Name: leads_convencao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads_convencao ENABLE ROW LEVEL SECURITY;

--
-- Name: simulador_precos leitura_autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_autenticado ON public.simulador_precos FOR SELECT TO authenticated USING (true);


--
-- Name: configuracao_taxas leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.configuracao_taxas FOR SELECT USING (true);


--
-- Name: garantias leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.garantias FOR SELECT USING (true);


--
-- Name: historico_estoque leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.historico_estoque FOR SELECT USING (true);


--
-- Name: lojas leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.lojas FOR SELECT USING (true);


--
-- Name: modelos leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.modelos FOR SELECT USING (true);


--
-- Name: motos leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.motos FOR SELECT USING (true);


--
-- Name: ordens_servico leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.ordens_servico FOR SELECT USING (true);


--
-- Name: pedidos_venda leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.pedidos_venda FOR SELECT USING (true);


--
-- Name: precificacao leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.precificacao FOR SELECT USING (true);


--
-- Name: transferencias leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.transferencias FOR SELECT USING (true);


--
-- Name: usuarios leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.usuarios FOR SELECT USING (true);


--
-- Name: vendas leitura_global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_global ON public.vendas FOR SELECT USING (true);


--
-- Name: lojas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_investimento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_investimento ENABLE ROW LEVEL SECURITY;

--
-- Name: metas_loja; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metas_loja ENABLE ROW LEVEL SECURITY;

--
-- Name: modelo_apelidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modelo_apelidos ENABLE ROW LEVEL SECURITY;

--
-- Name: modelo_bling_codigos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modelo_bling_codigos ENABLE ROW LEVEL SECURITY;

--
-- Name: modelos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modelos ENABLE ROW LEVEL SECURITY;

--
-- Name: motos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motos ENABLE ROW LEVEL SECURITY;

--
-- Name: motos_fiscal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motos_fiscal ENABLE ROW LEVEL SECURITY;

--
-- Name: nfe_dfe_sync; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nfe_dfe_sync ENABLE ROW LEVEL SECURITY;

--
-- Name: nfe_recebidas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nfe_recebidas ENABLE ROW LEVEL SECURITY;

--
-- Name: notagateway_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notagateway_config ENABLE ROW LEVEL SECURITY;

--
-- Name: notas_fiscais_saida; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notas_fiscais_saida ENABLE ROW LEVEL SECURITY;

--
-- Name: ordens_servico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;

--
-- Name: origens_venda; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.origens_venda ENABLE ROW LEVEL SECURITY;

--
-- Name: os_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.os_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: pecas_catalogo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pecas_catalogo ENABLE ROW LEVEL SECURITY;

--
-- Name: pecas_catalogo_valor_bkp_20260828; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pecas_catalogo_valor_bkp_20260828 ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos_fabrica_alerta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos_fabrica_alerta ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos_venda; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos_venda ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_mcp_sync_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pix_mcp_sync_status ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_recebimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pix_recebimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_recebimentos_mcp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pix_recebimentos_mcp ENABLE ROW LEVEL SECURITY;

--
-- Name: precificacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.precificacao ENABLE ROW LEVEL SECURITY;

--
-- Name: premiacao_faixas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.premiacao_faixas ENABLE ROW LEVEL SECURITY;

--
-- Name: regras_fiscais_saida; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regras_fiscais_saida ENABLE ROW LEVEL SECURITY;

--
-- Name: reservas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

--
-- Name: servicos_catalogo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.servicos_catalogo ENABLE ROW LEVEL SECURITY;

--
-- Name: simulador_precos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.simulador_precos ENABLE ROW LEVEL SECURITY;

--
-- Name: transferencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transferencias ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios_dados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios_dados ENABLE ROW LEVEL SECURITY;

--
-- Name: veiculos_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veiculos_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: vendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

--
-- Name: vendas_pecas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendas_pecas ENABLE ROW LEVEL SECURITY;

--
-- Name: vendas_pecas_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendas_pecas_itens ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



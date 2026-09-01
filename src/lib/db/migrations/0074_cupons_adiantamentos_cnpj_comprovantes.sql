-- 0074_cupons_adiantamentos_cnpj_comprovantes.sql
-- Quatro frentes que só compartilham o deploy:
--   1. cupons de revisão gratuita (módulo novo, resgatados no pagamento da OS)
--   2. adiantamento salarial (desconto na folha, não mexe em caixa/despesa)
--   3. venda para CNPJ em OS e peças (documento do tomador no recibo)
--   4. comprovante de garantia encerrada (quem encerrou e com que observação)

-- ── 1. Cupons de revisão gratuita ────────────────────────────────────────────
-- Emissão é sempre manual (decisão do Cesar em 01/09/2026): vender moto NÃO gera
-- cupom sozinho. O cupom cobre só a mão de obra da OS — peça e óleo o cliente paga.
CREATE TABLE IF NOT EXISTS cupons_revisao (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id            uuid NOT NULL REFERENCES grupos(id),
  -- Loja que emitiu. O cupom vale em qualquer loja do mesmo grupo.
  loja_id             uuid NOT NULL REFERENCES lojas(id),
  codigo              text NOT NULL UNIQUE,
  cliente_id          uuid REFERENCES clientes(id),
  cliente_nome        text,
  moto_id             uuid REFERENCES motos(id),
  chassi              text,
  observacao          text,
  valido_ate          date NOT NULL,
  -- 'ativo' | 'usado' | 'cancelado'. Vencido NÃO é status: sai de valido_ate, senão
  -- dependeria de alguém rodar um job pra virar a chave.
  status              text NOT NULL DEFAULT 'ativo',
  os_id               uuid REFERENCES ordens_servico(id),
  usado_em            timestamptz,
  valor_abatido       numeric(10,2),
  emitido_por         uuid REFERENCES usuarios(id),
  emitido_em          timestamptz NOT NULL DEFAULT now(),
  cancelado_por       uuid REFERENCES usuarios(id),
  cancelado_em        timestamptz,
  motivo_cancelamento text
);
CREATE INDEX IF NOT EXISTS cupons_revisao_grupo_status_idx ON cupons_revisao (grupo_id, status);
CREATE INDEX IF NOT EXISTS cupons_revisao_os_idx           ON cupons_revisao (os_id);

-- ── 2. Adiantamento salarial ─────────────────────────────────────────────────
-- Só desconta na folha do mês. Não vira despesa nem saída de caixa: o salário
-- cheio já é contabilizado quando pago, e lançar os dois contaria o mesmo dinheiro
-- duas vezes. Mesmo molde de folha_ajustes_base — mes em text pra não cair no fuso.
CREATE TABLE IF NOT EXISTS folha_adiantamentos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id    uuid NOT NULL REFERENCES lojas(id),
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  mes        text NOT NULL,
  valor      numeric(12,2) NOT NULL,
  data       date,
  observacao text,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS folha_adiantamentos_mes_idx ON folha_adiantamentos (mes, loja_id);

-- ── 3. Venda para CNPJ ───────────────────────────────────────────────────────
-- Peça avulsa e OS até aqui só guardavam o NOME do cliente. Sem documento não dá
-- pra emitir recibo para empresa. `cliente_id` liga no cadastro quando existe;
-- os campos soltos atendem o balcão, que não cadastra ninguém.
ALTER TABLE vendas_pecas
  ADD COLUMN IF NOT EXISTS cliente_id           uuid REFERENCES clientes(id),
  ADD COLUMN IF NOT EXISTS cliente_documento    text,
  ADD COLUMN IF NOT EXISTS cliente_tipo_pessoa  text NOT NULL DEFAULT 'fisica';

ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS cliente_documento_externo   text,
  ADD COLUMN IF NOT EXISTS cliente_tipo_pessoa_externo text;

-- ── 4. Comprovante de garantia encerrada ─────────────────────────────────────
-- A observação do encerramento só existia dentro de historico_estoque, e só quando
-- a moto voltava pra disponível — o comprovante precisa dela sempre.
ALTER TABLE garantias
  ADD COLUMN IF NOT EXISTS observacao_encerramento text,
  ADD COLUMN IF NOT EXISTS encerrada_por           uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS encerrada_em            timestamptz;

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

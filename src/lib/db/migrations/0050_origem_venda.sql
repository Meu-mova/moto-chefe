-- Origem da venda: catálogo por grupo + campo obrigatório na venda de moto.
-- Ver docs/superpowers/specs/2026-08-08-origem-venda-design.md

CREATE TABLE IF NOT EXISTS origens_venda (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id     uuid NOT NULL REFERENCES grupos(id),
  nome         text NOT NULL,
  tipo         text NOT NULL DEFAULT 'Outro'
               CHECK (tipo IN ('Digital','Presencial','Relacional','Parceria','Ativo','Outro')),
  pede_detalhe boolean NOT NULL DEFAULT false,
  ativo        boolean NOT NULL DEFAULT true,
  ordem        integer NOT NULL DEFAULT 0,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS origens_venda_nome_unq
  ON origens_venda (grupo_id, lower(trim(nome)));

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS origem_id      uuid REFERENCES origens_venda(id),
  ADD COLUMN IF NOT EXISTS origem_detalhe text;

CREATE INDEX IF NOT EXISTS vendas_origem_id_idx ON vendas (origem_id);

COMMENT ON COLUMN vendas.origem_id IS
  'Por onde o cliente chegou. NULL = venda anterior ao deploy (aparece como "Nao informado").';

-- Seed: as 16 origens iniciais, para cada grupo. Editável em /admin/origens depois.
INSERT INTO origens_venda (grupo_id, nome, tipo, pede_detalhe, ordem)
SELECT g.id, s.nome, s.tipo, s.pede_detalhe, s.ordem
FROM grupos g
CROSS JOIN (VALUES
  ('Instagram',                        'Digital',    false, 10),
  ('Instagram (anúncio)',              'Digital',    false, 20),
  ('Facebook',                         'Digital',    false, 30),
  ('WhatsApp',                         'Digital',    false, 40),
  ('Google (busca)',                   'Digital',    false, 50),
  ('Google Ads',                       'Digital',    false, 60),
  ('Classificados (OLX, ML, iCarros)', 'Digital',    true,  70),
  ('Passou na porta',                  'Presencial', false, 80),
  ('Evento / feira',                   'Presencial', true,  90),
  ('Indicação de cliente',             'Relacional', true,  100),
  ('Cliente antigo / recompra',        'Relacional', false, 110),
  ('Parceiro / revenda',               'Parceria',   true,  120),
  ('Empresa ou frota (PJ)',            'Parceria',   true,  130),
  ('Oficina / pós-venda',              'Ativo',      false, 140),
  ('Não informou',                     'Outro',      false, 150),
  ('Outro',                            'Outro',      true,  160)
) AS s(nome, tipo, pede_detalhe, ordem)
ON CONFLICT DO NOTHING;

-- efetivar_venda passa a gravar a origem.
--
-- É o caminho de pedido/reserva efetivada e insere em vendas dentro do banco — sem isso, toda
-- venda vinda de pedido nasceria sem origem e a obrigatoriedade seria ficção. Gravar aqui, e não
-- num UPDATE depois: campo obrigatório precisa nascer na mesma transação.
--
-- DROP + CREATE porque CREATE OR REPLACE não muda a lista de argumentos, e manter as duas
-- versões deixaria a chamada de 6 argumentos ambígua.
DROP FUNCTION IF EXISTS efetivar_venda(uuid, uuid, text, text, numeric, text);

CREATE FUNCTION efetivar_venda(
  p_pedido_id uuid,
  p_efetivado_por uuid,
  p_cliente_nome text,
  p_cliente_cpf text,
  p_valor numeric,
  p_forma_pagamento text,
  p_origem_id uuid DEFAULT NULL,
  p_origem_detalhe text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;

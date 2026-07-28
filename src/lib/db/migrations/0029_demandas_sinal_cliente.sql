-- Demandas: sinal com recibo, cliente completo desnormalizado e vínculo com venda.
-- Cadastro de cliente + recibo só são exigidos quando há sinal (mirror da reserva).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'demanda_status') THEN
    CREATE TYPE demanda_status AS ENUM ('aberta', 'atendida');
  END IF;
END $$;

ALTER TABLE demandas
  ADD COLUMN IF NOT EXISTS modelo_id          uuid REFERENCES modelos(id),
  ADD COLUMN IF NOT EXISTS numero             integer,
  ADD COLUMN IF NOT EXISTS meio_pagamento     text,
  ADD COLUMN IF NOT EXISTS sinal_recebido_em  timestamptz,
  ADD COLUMN IF NOT EXISTS status             demanda_status NOT NULL DEFAULT 'aberta',
  ADD COLUMN IF NOT EXISTS venda_id           uuid REFERENCES vendas(id),
  ADD COLUMN IF NOT EXISTS cliente_nome        text,
  ADD COLUMN IF NOT EXISTS cliente_cpf         text,
  ADD COLUMN IF NOT EXISTS cliente_celular     text,
  ADD COLUMN IF NOT EXISTS cliente_email       text,
  ADD COLUMN IF NOT EXISTS cliente_cep         text,
  ADD COLUMN IF NOT EXISTS cliente_logradouro  text,
  ADD COLUMN IF NOT EXISTS cliente_numero      text,
  ADD COLUMN IF NOT EXISTS cliente_complemento text,
  ADD COLUMN IF NOT EXISTS cliente_bairro      text,
  ADD COLUMN IF NOT EXISTS cliente_cidade      text,
  ADD COLUMN IF NOT EXISTS cliente_estado      text;

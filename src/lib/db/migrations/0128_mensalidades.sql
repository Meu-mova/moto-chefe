-- Cobrança mensal do MOVA aos lojistas (#208). Spec 2026-09-14-assinatura-mova-design.md.
CREATE TABLE IF NOT EXISTS mensalidade_config (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id         uuid NOT NULL UNIQUE REFERENCES grupos(id),
  adesao_id        uuid REFERENCES adesoes_mova(id),
  valor_mensal     numeric(12, 2),
  taxa_implantacao numeric(12, 2),
  isento           boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'inadimplente', 'bloqueada')),
  bloqueia_em      date,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

-- Uma por grupo e competência: rodar o cron duas vezes não cobra duas vezes.
CREATE TABLE IF NOT EXISTS mensalidades (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id         uuid NOT NULL REFERENCES grupos(id),
  competencia      text NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),
  valor            numeric(12, 2) NOT NULL,
  taxa_implantacao numeric(12, 2) NOT NULL DEFAULT 0,
  acrescimo        numeric(12, 2) NOT NULL DEFAULT 0,
  vencimento       date NOT NULL,
  status           text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'cancelada')),
  mp_preference_id text,
  mp_payment_id    text,
  link_pagamento   text,
  pago_em          timestamptz,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mensalidades_grupo_competencia UNIQUE (grupo_id, competencia)
);

CREATE TABLE IF NOT EXISTS mensalidade_webhook_eventos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_notification_id text NOT NULL UNIQUE,
  tipo               text,
  action             text,
  data_id            text,
  live_mode          boolean,
  recebido_em        timestamptz NOT NULL DEFAULT now(),
  processado_em      timestamptz,
  erro               text
);

-- Sem policy: nada passa pela API pública do Supabase (chave anon). Só o
-- servidor, com o papel do banco, lê e grava.
ALTER TABLE mensalidade_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensalidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensalidade_webhook_eventos ENABLE ROW LEVEL SECURITY;

-- Todo grupo que existe hoje é do Cesar (Sul de Minas, BH e Vale): nasce isento.
INSERT INTO mensalidade_config (grupo_id, isento)
SELECT id, true FROM grupos
ON CONFLICT (grupo_id) DO NOTHING;

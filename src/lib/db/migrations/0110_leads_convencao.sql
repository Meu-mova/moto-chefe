-- Leads capturados na landing pública /convencao (QR do pitch da convenção
-- MotoChefe 2026). Não é escopado por grupo: são prospects externos.
CREATE TABLE IF NOT EXISTS leads_convencao (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  email      text NOT NULL,
  whatsapp   text NOT NULL,
  unidade    text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

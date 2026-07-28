-- Integração Kommo (CRM) — conexão OAuth global (uma conta para toda a empresa).
-- Tabela singleton: sempre a linha id = 'global'.

CREATE TABLE IF NOT EXISTS kommo_config (
  id            text PRIMARY KEY DEFAULT 'global',
  subdominio    text,
  client_id     text,
  client_secret text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

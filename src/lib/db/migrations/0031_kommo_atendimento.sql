-- Métricas de atendimento (Kommo): mapeamento colaborador, cache de leads e status de sync.

-- Mapa: usuário do Kommo -> colaborador do Mova (casado manualmente; e-mail não bate).
CREATE TABLE IF NOT EXISTS kommo_user_map (
  kommo_user_id text PRIMARY KEY,
  usuario_id    uuid REFERENCES usuarios(id),
  nome_kommo    text
);

-- Cache de leads do Kommo (sincronizado incrementalmente por updated_at).
CREATE TABLE IF NOT EXISTS kommo_leads (
  lead_id        bigint PRIMARY KEY,
  kommo_user_id  text,
  status_id      integer,
  pipeline_id    text,
  price          numeric(12,2) NOT NULL DEFAULT 0,
  criado_em      timestamptz,
  fechado_em     timestamptz,
  atualizado_em  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_kommo_leads_user ON kommo_leads (kommo_user_id);
CREATE INDEX IF NOT EXISTS idx_kommo_leads_criado ON kommo_leads (criado_em);
CREATE INDEX IF NOT EXISTS idx_kommo_leads_fechado ON kommo_leads (fechado_em);

-- Controle de staleness do cache (linha única).
CREATE TABLE IF NOT EXISTS kommo_sync_status (
  id                   text PRIMARY KEY DEFAULT 'global',
  ultima_sincronizacao timestamptz,
  ultimo_updated_at    bigint
);

-- Semeia o mapa dos 12 colaboradores de atendimento (Kommo id -> e-mail corporativo Mova).
INSERT INTO kommo_user_map (kommo_user_id, usuario_id, nome_kommo)
SELECT m.kommo_user_id, u.id, m.nome_kommo
FROM (VALUES
  ('13350539', 'kawan.manso@motochefesuldeminas.com.br',      'KAWAN'),
  ('13739287', 'pablo.albinati@motochefesuldeminas.com.br',   'PABLO'),
  ('13739563', 'tiago.gomes@motochefesuldeminas.com.br',      'TIAGO'),
  ('13815307', 'julia.nascimento@motochefesuldeminas.com.br', 'JULIA NASCIMENTO'),
  ('14949524', 'rayssa.dayane@motochefesuldeminas.com.br',    'RAYSSA'),
  ('14949596', 'emanuel.paiva@motochefesuldeminas.com.br',    'EMANUEL'),
  ('15027868', 'anne.ester@motochefesuldeminas.com.br',       'ANNE'),
  ('15080888', 'gabriel.barbosa@motochefesuldeminas.com.br',  'TADEU'),
  ('15080908', 'luara.alkmin@motochefesuldeminas.com.br',     'LUARA'),
  ('15218112', 'brenda.aquiles@motochefesuldeminas.com.br',   'BRENDA'),
  ('15608164', 'lara.oliveira@motochefesuldeminas.com.br',    'LARA'),
  ('15608216', 'juliana.rodrigues@motochefesuldeminas.com.br','JULIANA')
) AS m(kommo_user_id, email, nome_kommo)
JOIN usuarios u ON lower(u.email) = m.email
ON CONFLICT (kommo_user_id) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, nome_kommo = EXCLUDED.nome_kommo;

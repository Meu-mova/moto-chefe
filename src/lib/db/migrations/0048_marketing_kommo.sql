-- Relatório de Marketing — leads de entrada do Kommo por canal e grupo.
-- Ver docs/superpowers/specs/2026-08-06-marketing-leads-kommo-design.md

-- 1) Canal de entrada do lead. A API só devolve com `with=source_id`; o
--    histórico é preenchido pelo scripts/backfill-kommo-source.ts.
ALTER TABLE kommo_leads ADD COLUMN IF NOT EXISTS source_id bigint;
CREATE INDEX IF NOT EXISTS kommo_leads_source_id_idx ON kommo_leads (source_id);
CREATE INDEX IF NOT EXISTS kommo_leads_criado_em_idx ON kommo_leads (criado_em);

-- 2) Catálogo de canal. origem/perfil vêm do sync (/talks e /unsorted);
--    `nome` é rótulo humano e o sync NUNCA sobrescreve.
CREATE TABLE IF NOT EXISTS kommo_sources (
  source_id     bigint PRIMARY KEY,
  origem        text,
  perfil        text,
  nome          text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- 3) Funil (pipeline) → grupo. É daqui que o relatório tira o grupo, e não do
--    vendedor responsável: funil está preenchido em 100% dos leads.
CREATE TABLE IF NOT EXISTS kommo_pipeline_grupo (
  pipeline_id   text PRIMARY KEY,
  grupo_id      uuid REFERENCES grupos(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Seed por NOME do grupo (os uuid de BH/Vale variam por ambiente).
INSERT INTO kommo_pipeline_grupo (pipeline_id, grupo_id)
SELECT p.pipeline_id, g.id
FROM (VALUES
  ('10075383', 'Sul de Minas'),  -- Varginha
  ('10143523', 'Sul de Minas'),  -- Pouso Alegre
  ('11452899', 'Sul de Minas'),  -- Poços de Caldas
  ('13503996', 'Sul de Minas'),  -- Itajubá
  ('10075387', 'Sul de Minas'),  -- Lavras
  ('9755551',  'Sul de Minas'),  -- Funil de vendas (EcoMov)
  ('11244991', 'Sul de Minas'),  -- MATRIZ
  ('13777384', 'Sul de Minas'),  -- SDR (parado desde dez/2025)
  ('9791667',  'BH'),            -- BH Raja
  ('9902851',  'Vale'),          -- Pinda
  ('14163412', 'Vale')           -- Taubaté
) AS p(pipeline_id, grupo_nome)
JOIN grupos g ON g.nome = p.grupo_nome
ON CONFLICT (pipeline_id) DO NOTHING;

-- 4) Investimento em mídia. grupo_id é redundante com pipeline_id de propósito:
--    permite lançar verba do grupo inteiro sem amarrar a uma loja.
CREATE TABLE IF NOT EXISTS marketing_investimento (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id    uuid NOT NULL REFERENCES grupos(id),
  mes         date NOT NULL,
  pipeline_id text,
  plataforma  text NOT NULL,
  valor       numeric(12,2) NOT NULL DEFAULT 0,
  observacao  text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_investimento_unq
  ON marketing_investimento (grupo_id, mes, coalesce(pipeline_id, ''), plataforma);
CREATE INDEX IF NOT EXISTS marketing_investimento_grupo_mes_idx
  ON marketing_investimento (grupo_id, mes);

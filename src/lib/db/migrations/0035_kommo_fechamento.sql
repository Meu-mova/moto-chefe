-- Fase 4 do Atendimento (Kommo): leads nas etapas finais sem tarefa agendada.

-- Nome do lead no cache (para listar o lead no card do vendedor).
ALTER TABLE kommo_leads ADD COLUMN IF NOT EXISTS nome text;

-- Catálogo de funis/etapas do Kommo. etapa_fechamento é calculado no sync a
-- partir do nome ("tem interesse" / "em negociação"). Os status 142/143
-- (ganho/perdido) são globais e não entram aqui.
CREATE TABLE IF NOT EXISTS kommo_stages (
  status_id        bigint PRIMARY KEY,
  pipeline_id      text,
  pipeline_nome    text,
  nome             text NOT NULL,
  sort             integer NOT NULL DEFAULT 0,
  etapa_fechamento boolean NOT NULL DEFAULT false
);

-- Tarefas em aberto (is_completed = 0) vinculadas a leads. Substituída a cada
-- sync — assim tarefa concluída/deletada some sozinha.
CREATE TABLE IF NOT EXISTS kommo_tarefas_abertas (
  id            bigint PRIMARY KEY,
  lead_id       bigint NOT NULL,
  kommo_user_id text,
  prazo         timestamptz,
  texto         text
);

CREATE INDEX IF NOT EXISTS kommo_tarefas_abertas_lead_idx ON kommo_tarefas_abertas (lead_id);

-- Tempo de 1ª resposta passa a ser mediana diária em horário comercial (8h–18h BRT).
-- Nova coluna (mantém resp_soma_seg por ora, sem quebrar a página em produção).
ALTER TABLE kommo_atividade_diaria
  ADD COLUMN IF NOT EXISTS resp_mediana_seg bigint NOT NULL DEFAULT 0;

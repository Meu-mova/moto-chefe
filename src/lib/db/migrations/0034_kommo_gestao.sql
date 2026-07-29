-- Fase 3 do Atendimento (Kommo): leads sem resposta, SLA de 1ª resposta, motivo de perda.

-- Estado de resposta por lead + motivo de perda no cache de leads.
ALTER TABLE kommo_leads
  ADD COLUMN IF NOT EXISTS loss_reason_id        bigint,
  ADD COLUMN IF NOT EXISTS primeiro_incoming_em  timestamptz,  -- 1ª mensagem do cliente
  ADD COLUMN IF NOT EXISTS primeira_resposta_em  timestamptz;  -- 1ª resposta humana

-- Catálogo de motivos de perda (id -> nome), da API do Kommo.
CREATE TABLE IF NOT EXISTS kommo_loss_reasons (
  id   bigint PRIMARY KEY,
  nome text NOT NULL
);

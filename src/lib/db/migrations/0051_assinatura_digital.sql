-- Assinatura digital de documentos (contrato de venda, checklist de entrega).
-- Ver docs/superpowers/specs/2026-08-11-assinatura-digital-design.md

CREATE TABLE IF NOT EXISTS documentos_assinatura (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id          uuid NOT NULL REFERENCES grupos(id),
  loja_id           uuid REFERENCES lojas(id),
  venda_id          uuid NOT NULL REFERENCES vendas(id),
  tipo              text NOT NULL CHECK (tipo IN ('contrato_venda','checklist_entrega')),
  token             text NOT NULL UNIQUE,
  status            text NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','visualizado','assinado','expirado','cancelado')),
  html_snapshot     text NOT NULL,
  snapshot_hash     text NOT NULL,
  celular_destino   text NOT NULL,
  selfie_path       text,
  selfie_hash       text,
  assinatura_path   text,
  assinatura_hash   text,
  ip_assinatura     text,
  user_agent        text,
  geo_lat           numeric(10,7),
  geo_lon           numeric(10,7),
  geo_precisao      numeric(10,2),
  evidencias_json   jsonb,
  doc_hash          text,
  criado_por        uuid REFERENCES usuarios(id),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  expira_em         timestamptz NOT NULL,
  assinado_em       timestamptz
);

CREATE INDEX IF NOT EXISTS documentos_assinatura_venda_idx ON documentos_assinatura (venda_id);
CREATE INDEX IF NOT EXISTS documentos_assinatura_grupo_status_idx ON documentos_assinatura (grupo_id, status);

-- Um documento vivo por (venda, tipo). Reenvio reaproveita a linha; documento
-- assinado, expirado ou cancelado não bloqueia um novo envio.
CREATE UNIQUE INDEX IF NOT EXISTS documentos_assinatura_vivo_unq
  ON documentos_assinatura (venda_id, tipo)
  WHERE status IN ('pendente','visualizado');

CREATE TABLE IF NOT EXISTS assinatura_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id  uuid NOT NULL REFERENCES documentos_assinatura(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN
                ('enviado','link_aberto','codigo_enviado','codigo_errado','codigo_ok',
                 'selfie_enviada','assinado','reenviado','cancelado')),
  ip            text,
  user_agent    text,
  detalhe       jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assinatura_eventos_documento_idx ON assinatura_eventos (documento_id, criado_em);

CREATE TABLE IF NOT EXISTS assinatura_codigos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id  uuid NOT NULL REFERENCES documentos_assinatura(id) ON DELETE CASCADE,
  codigo_hash   text NOT NULL,
  expira_em     timestamptz NOT NULL,
  tentativas    integer NOT NULL DEFAULT 0,
  usado_em      timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assinatura_codigos_documento_idx ON assinatura_codigos (documento_id, criado_em DESC);

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS nf_liberada_em      timestamptz,
  ADD COLUMN IF NOT EXISTS nf_liberada_por     uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS nf_liberacao_motivo text;

COMMENT ON COLUMN vendas.nf_liberada_em IS
  'Preenchido quando admin libera a NF sem contrato assinado. O motivo é obrigatório.';

-- Qualificação da pessoa jurídica vendedora no contrato. O modelo do advogado
-- traz esses dados fixos do Sul de Minas; BH e Vale são outras empresas.
ALTER TABLE grupos
  ADD COLUMN IF NOT EXISTS razao_social  text,
  ADD COLUMN IF NOT EXISTS endereco_sede text,
  ADD COLUMN IF NOT EXISTS comarca_foro  text;

-- Sul de Minas: dados extraídos do próprio modelo do contrato.
UPDATE grupos SET
  razao_social  = 'MOTOCHEFE SUL DE MINAS LTDA.',
  endereco_sede = 'Avenida Prefeito Tuany Toledo, n° 249, Bairro Fátima II, CEP: 37.553-571, Pouso Alegre – MG',
  comarca_foro  = 'Pouso Alegre, Minas Gerais'
WHERE cnpj = '57.113.017/0001-72';

-- Bucket privado das selfies e dos traços de assinatura.
INSERT INTO storage.buckets (id, name, public)
VALUES ('assinaturas', 'assinaturas', false)
ON CONFLICT (id) DO NOTHING;

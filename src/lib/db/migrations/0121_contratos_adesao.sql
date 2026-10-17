-- Contrato de adesão ao MOVA assinado pelo lojista (#165). Mesma assinatura por
-- link da venda (código por e-mail, selfie, traço, evidências), mas em tabelas
-- próprias: é documento da plataforma, não de um grupo (ADR-0017). As regras
-- moram em src/lib/assinatura/fluxo.ts.

CREATE TABLE IF NOT EXISTS contratos_adesao (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adesao_id         uuid NOT NULL REFERENCES adesoes_mova(id),
  token             text NOT NULL UNIQUE,
  status            text NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','visualizado','assinado','expirado','cancelado')),
  html_snapshot     text NOT NULL,
  snapshot_hash     text NOT NULL,
  email_destino     text NOT NULL,
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

-- Um contrato vivo por adesão. Reenviar cancela o anterior; assinado, expirado
-- ou cancelado não bloqueia um novo envio.
CREATE UNIQUE INDEX IF NOT EXISTS contratos_adesao_vivo_unq
  ON contratos_adesao (adesao_id)
  WHERE status IN ('pendente','visualizado');

CREATE INDEX IF NOT EXISTS contratos_adesao_adesao_idx ON contratos_adesao (adesao_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS contratos_adesao_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id   uuid NOT NULL REFERENCES contratos_adesao(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN
                ('enviado','link_aberto','codigo_enviado','codigo_errado','codigo_ok',
                 'selfie_enviada','assinado','reenviado','cancelado')),
  ip            text,
  user_agent    text,
  detalhe       jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contratos_adesao_eventos_contrato_idx ON contratos_adesao_eventos (contrato_id, criado_em);

CREATE TABLE IF NOT EXISTS contratos_adesao_codigos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id   uuid NOT NULL REFERENCES contratos_adesao(id) ON DELETE CASCADE,
  codigo_hash   text NOT NULL,
  expira_em     timestamptz NOT NULL,
  tentativas    integer NOT NULL DEFAULT 0,
  usado_em      timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contratos_adesao_codigos_contrato_idx ON contratos_adesao_codigos (contrato_id, criado_em DESC);

-- Sem policy: nada passa pela API pública do Supabase (chave anon). Só o
-- servidor, com o papel do banco, lê e grava.
ALTER TABLE contratos_adesao ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos_adesao_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos_adesao_codigos ENABLE ROW LEVEL SECURITY;

-- Selfie e traço do lojista, separados do bucket `assinaturas` da venda.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contratos-adesao', 'contratos-adesao', false, 5242880, array['image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;

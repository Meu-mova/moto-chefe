-- Assinatura em papel: cliente sem acesso digital assina na loja, e o vendedor
-- registra no sistema anexando a foto/digitalização da via assinada.
--
-- O documento em papel entra na MESMA tabela, com status 'assinado' e
-- assinatura_modo = 'papel'. Assim a trava da NF, os ícones da lista e o dossiê
-- continuam funcionando sem saber de qual caminho veio a assinatura.

ALTER TABLE documentos_assinatura
  ADD COLUMN IF NOT EXISTS assinatura_modo  text NOT NULL DEFAULT 'digital',
  ADD COLUMN IF NOT EXISTS via_fisica_path  text,
  ADD COLUMN IF NOT EXISTS via_fisica_hash  text,
  ADD COLUMN IF NOT EXISTS registrado_por   uuid REFERENCES usuarios(id);

DO $$ BEGIN
  ALTER TABLE documentos_assinatura
    ADD CONSTRAINT documentos_assinatura_modo_check
    CHECK (assinatura_modo IN ('digital', 'papel'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN documentos_assinatura.assinatura_modo IS
  'digital = assinado pelo celular do cliente; papel = assinado na loja e digitalizado';

-- 'assinado_em_papel' na trilha de eventos.
ALTER TABLE assinatura_eventos DROP CONSTRAINT IF EXISTS assinatura_eventos_tipo_check;
ALTER TABLE assinatura_eventos ADD CONSTRAINT assinatura_eventos_tipo_check
  CHECK (tipo IN ('enviado','link_aberto','codigo_enviado','codigo_errado','codigo_ok',
                  'selfie_enviada','assinado','reenviado','cancelado','assinado_em_papel'));

-- src/lib/db/migrations/0092_certificados_digitais.sql
-- Certificado A1 por grupo, cifrado.
--
-- Não vai em variável de ambiente: o .pfx tem ~12 KB em base64 e o conjunto de
-- variáveis da Vercel tem teto — dois CNPJs já apertam, e a premissa do MOVA é
-- que tudo nasce escopado por grupo. "Uma variável por CNPJ" não é solução.
--
-- `arquivo` e `senha` guardam o pacote de src/lib/cripto.ts (iv:tag:dados). O
-- banco sozinho não abre nada: a chave mestra vive em CERT_MASTER_KEY.

CREATE TABLE IF NOT EXISTS certificados_digitais (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id    uuid NOT NULL UNIQUE REFERENCES grupos(id) ON DELETE CASCADE,
  arquivo     text NOT NULL,
  senha       text NOT NULL,
  cnpj        text NOT NULL,
  titular     text NOT NULL,
  valido_ate  timestamptz NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

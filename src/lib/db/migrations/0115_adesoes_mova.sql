-- Pedidos de adesão ao MOVA vindos da página pública /adesao. Não é escopado por grupo: o grupo
-- e a loja ainda não existem, a equipe cria depois de revisar.
--
-- Segredos (certificado A1, senha do certificado, senha do motochefe.store) ficam CIFRADOS no
-- banco com src/lib/cripto.ts, como em certificados_digitais. O cartão CNPJ vai para um bucket
-- PRIVADO; o caminho é guardado aqui e o arquivo só se abre por URL assinada.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('adesoes', 'adesoes', false, 5242880,
        array['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS adesoes_mova (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja              text NOT NULL,
  responsavel       text NOT NULL,
  celular           text NOT NULL,
  cnpj_arquivo_path text NOT NULL,
  cert_arquivo      text NOT NULL,
  cert_senha        text NOT NULL,
  store_login       text NOT NULL,
  store_senha       text NOT NULL,
  -- [{ nome, email, papel }], papel = valor do enum `papel` (nunca admin_geral)
  usuarios          jsonb NOT NULL,
  -- 'pendente' | 'processada'
  status            text NOT NULL DEFAULT 'pendente',
  criado_em         timestamptz NOT NULL DEFAULT now()
);

-- Sem policy: o acesso é só pelo servidor (Drizzle/service role), nunca pela chave anon.
ALTER TABLE adesoes_mova ENABLE ROW LEVEL SECURITY;

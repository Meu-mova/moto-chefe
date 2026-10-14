-- Stubs do Supabase para aplicar o schema-baseline.sql num Postgres puro: o banco
-- descartável do job `validar` (.github/workflows/migracoes.yml). Nunca rode isto num
-- projeto Supabase, que já tem tudo abaixo de verdade.
--
-- Só o que o baseline usa: os papéis do Supabase (policies `TO authenticated`) e
-- `auth.uid()` (funções de permissão). Migração nova que mexa em `storage.*` ou em
-- tabelas do `auth` falha no CI até este arquivo ganhar o stub correspondente.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE SCHEMA auth;

-- No Supabase, devolve o usuário do JWT da requisição; aqui não há requisição.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

-- Só as colunas que as migrações usam ao criar bucket (INSERT INTO storage.buckets ...).
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  public             boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

-- Dados fiscais na adesão (#588): o que a Nota Gateway pede no cadastro "Nova empresa"
-- e a adesão não coletava. Razão social, CNPJ e endereço reusam as colunas da 0118/0140.
alter table adesoes_mova
  add column if not exists nome_fantasia text,
  add column if not exists telefone text,
  add column if not exists sede_codigo_ibge text,
  add column if not exists situacao_cadastral text,
  add column if not exists regime text check (regime in ('simples', 'mei', 'normal')),
  add column if not exists inscricao_estadual text check (inscricao_estadual ~ '^[0-9]+$'),
  add column if not exists ie_isenta boolean not null default false,
  add column if not exists inscricao_municipal text check (inscricao_municipal ~ '^[0-9]+$'),
  add column if not exists email_notas text,
  add column if not exists nf_serie_anterior text check (nf_serie_anterior ~ '^[0-9]+$'),
  add column if not exists nf_ultimo_numero text check (nf_ultimo_numero ~ '^[0-9]+$');

-- Limite de tentativas das ações públicas (a adesão não tem login). Contador em memória
-- não serve na Vercel: cada instância teria o seu. Guarda só o hash do IP.
create table if not exists tentativas_acao (
  id bigint generated always as identity primary key,
  acao text not null,
  ip_hash text not null,
  criado_em timestamptz not null default now()
);
create index if not exists tentativas_acao_chave_idx on tentativas_acao (acao, ip_hash, criado_em);

-- RLS sem policy fecha a tabela para o PostgREST; o app lê e grava pelo Drizzle.
alter table tentativas_acao enable row level security;

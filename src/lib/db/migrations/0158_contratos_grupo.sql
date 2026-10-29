-- Contrato de compra e venda de cada grupo (CNPJ), por categoria da moto. Salvar cria
-- versão nova e nunca altera a anterior: documento já enviado aponta para a versão usada.
create table contratos_grupo (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references grupos(id),
  categoria  categoria not null,
  versao     integer not null,
  texto      text not null,
  criado_por uuid references usuarios(id),
  criado_em  timestamptz not null default now(),
  constraint contratos_grupo_versao_key unique (grupo_id, categoria, versao)
);

-- Nulo = texto do MOVA (autopropelido sem contrato do grupo) ou documento de antes do 0158.
alter table documentos_assinatura add column contrato_grupo_id uuid references contratos_grupo(id);

-- RLS sem policy fecha a tabela para o PostgREST; o app lê e grava pelo Drizzle.
alter table contratos_grupo enable row level security;

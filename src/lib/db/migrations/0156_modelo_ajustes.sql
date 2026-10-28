-- Ajuste da Conta sobre um modelo da plataforma (#476, adendo ao ADR-0018). Coluna nula
-- herda o original; o modelo em si não muda, para as outras Contas nem para o histórico.
create table modelo_ajustes (
  conta_id uuid not null references contas(id),
  modelo_id uuid not null references modelos(id) on delete cascade,
  modelo text,
  categoria categoria,
  potencia_w text,
  motor text,
  velocidade_max text,
  preco_compra_padrao numeric(12, 2),
  imagem_url text,
  oculto boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (conta_id, modelo_id)
);
create index modelo_ajustes_modelo_id_idx on modelo_ajustes (modelo_id);

-- RLS sem policy fecha a tabela para o PostgREST; o app lê e grava pelo Drizzle.
alter table modelo_ajustes enable row level security;

-- Marcas de moto que cada Conta enxerga nas listas de escolha (#287, adendo ao ADR-0018).
-- `modelos` continua da plataforma; Conta sem linha aqui vê todas as marcas.

create table conta_marcas (
  conta_id uuid not null references contas(id),
  marca    text not null,
  primary key (conta_id, marca)
);

-- RLS sem policy fecha a tabela para o PostgREST; o app lê e grava pelo Drizzle.
alter table conta_marcas enable row level security;

-- Placar de avaliações: vendas × toques por vendedor e vendas × avaliações novas por loja.
-- Número 0174: a 0172 e a 0173 estão nas branches feat/arquivar-moto e feat/demanda-comprovante-reserva.

-- Meta do grupo: quanto das vendas deve virar avaliação, em %.
alter table avaliacoes_google_config add column if not exists meta_pct integer not null default 80
  check (meta_pct between 1 and 100);

-- Total da loja na primeira e na última leitura de cada mês. O histórico diário some em 30 dias,
-- e fechar o mês precisa da primeira foto dele. Guarda só as duas contagens, nada da avaliação.
create table avaliacoes_google_total_mes (
  loja_id        uuid not null references lojas(id),
  grupo_id       uuid not null references grupos(id),
  mes            text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  total_inicial  integer not null,
  total_final    integer not null,
  primeira_em    timestamptz not null,
  ultima_em      timestamptz not null,
  primary key (loja_id, mes)
);

-- RLS sem policy fecha a tabela para o PostgREST; o app lê e grava pelo Drizzle (como a 0155).
alter table avaliacoes_google_total_mes enable row level security;

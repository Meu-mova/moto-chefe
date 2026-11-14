-- #904 (feature #682, decisões 1, 3 e 6 da #724): números do DIFAL da moto importada vendida a
-- consumidor final de outro estado.
--
-- aliquota_icms_importado: a alíquota interestadual da moto importada (4% na prática), do grupo,
-- vazia até o admin preencher com o contador dele. Mora em regras_fiscais_saida porque é a regra
-- de saída do mesmo CNPJ e se grava junto com ela ("Salvar tributação").
--
-- difal_uf_correcoes: a correção que o grupo faz sobre a tabela padrão do MOVA (que fica no
-- código, src/lib/notagateway/difal-ufs.ts). Só existe linha para a UF que o grupo corrigiu;
-- "voltar ao padrão" apaga a linha. Tabela própria, e não coluna em regras_fiscais_saida, porque
-- são até 27 linhas por grupo.
--
-- Só aditiva.

alter table regras_fiscais_saida add column aliquota_icms_importado numeric(5,2)
  check (aliquota_icms_importado between 0 and 100);

create table difal_uf_correcoes (
  grupo_id         uuid not null references grupos(id) on delete cascade,
  uf               text not null check (uf in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
    'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  aliquota_interna numeric(5,2) not null check (aliquota_interna between 0 and 100),
  fcp              numeric(5,2) not null default 0 check (fcp between 0 and 100),
  base             text not null check (base in ('unica','dupla')),
  atualizado_por   uuid references usuarios(id) on delete set null,
  atualizado_em    timestamptz not null default now(),
  primary key (grupo_id, uf)
);

-- RLS sem policy fecha a tabela para o PostgREST; o app lê e grava pelo Drizzle (como a 0156).
alter table difal_uf_correcoes enable row level security;

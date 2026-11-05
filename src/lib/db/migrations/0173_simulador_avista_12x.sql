-- Padrão do simulador por grupo. 'taxas': os três cards de hoje (21x e 12x calculados pela
-- taxa do cartão, e PIX). 'avista_12x': só PIX/dinheiro (o valor mínimo) e o total em 12x
-- que o administrador digita por modelo, sem taxa nenhuma.
alter table configuracao_taxas
  add column padrao_simulador text not null default 'taxas'
  check (padrao_simulador in ('taxas', 'avista_12x'));

-- Total em 12x do modelo no padrão 'avista_12x' (o valor cheio, não a parcela). Vazio: o
-- simulador mostra só o PIX do modelo, com o aviso para definir o 12x na Precificação.
alter table precificacao
  add column valor_12x numeric(12, 2)
  check (valor_12x is null or valor_12x > 0);

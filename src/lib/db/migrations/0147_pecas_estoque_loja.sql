-- Estoque de peças por loja (#195): cada loja tem o próprio saldo da peça do catálogo da
-- Conta. Sem linha = saldo zero. Nasce vazia (decisão do Luis, 26/10/2026): o número único
-- de pecas_catalogo nunca foi lançado de verdade, e só as vendas o baixaram a partir de 0.
-- Mesmo tipo de vendas_pecas_itens.quantidade, que é decimal.
create table pecas_estoque_loja (
  peca_id uuid not null references pecas_catalogo(id),
  loja_id uuid not null references lojas(id),
  quantidade numeric(10, 2) not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (peca_id, loja_id)
);

create index pecas_estoque_loja_loja_id_idx on pecas_estoque_loja (loja_id);

-- Itens do pedido de venda (#770, Refs #774): cada linha do que o cliente leva (moto, brinde,
-- acessório ou frete) com o seu valor. Expand: pedidos_venda.moto_id continua sendo lido por
-- tudo; o item só passa a ser gravado junto.
--
-- Tabela própria, não vendas_pecas_itens: aquela exige venda_peca_id e peca_id, e o item do
-- pedido tem moto e frete (sem peça) num pedido ainda pendente. Afrouxar as duas colunas faria
-- os leitores da venda de balcão (recibo, edição, exclusão, caixa) verem linha sem venda de peça.
--
-- Sem grupo_id, como vendas_pecas_itens e os_itens: o item é filho do pedido (apaga junto) e a
-- Conta vem da loja do pedido, lida num ponto só (pedidoDoUsuario). Um grupo_id aqui seria uma
-- segunda fonte da Conta, que pode divergir da loja.
--
-- valor_unitario nulo = valor ainda não informado (o Novo pedido não pede valor até o #783; a
-- efetivação preenche). Quem paga e quem leva o frete entram no #779. Sem backfill: pedido
-- anterior fica sem item e continua lido pelo moto_id.
create table pedidos_venda_itens (
  id              uuid primary key default gen_random_uuid(),
  pedido_venda_id uuid not null references pedidos_venda(id) on delete cascade,
  tipo            text not null,
  moto_id         uuid references motos(id),
  peca_id         uuid references pecas_catalogo(id),
  quantidade      numeric(10,2) not null default 1,
  valor_unitario  numeric(12,2),
  criado_em       timestamptz not null default now(),
  constraint pedidos_venda_itens_tipo_ck check (tipo in ('moto', 'brinde', 'acessorio', 'frete')),
  constraint pedidos_venda_itens_moto_ck check ((tipo = 'moto') = (moto_id is not null)),
  constraint pedidos_venda_itens_peca_ck check ((tipo in ('brinde', 'acessorio')) = (peca_id is not null)),
  constraint pedidos_venda_itens_quantidade_ck check (quantidade > 0 and (tipo <> 'moto' or quantidade = 1))
);

-- A mesma moto não entra duas vezes no mesmo pedido.
create unique index pedidos_venda_itens_moto_key on pedidos_venda_itens (pedido_venda_id, moto_id) where moto_id is not null;
create index pedidos_venda_itens_pedido_idx on pedidos_venda_itens (pedido_venda_id);

-- RLS sem policy fecha a tabela para o PostgREST; o app lê e grava pelo Drizzle.
alter table pedidos_venda_itens enable row level security;

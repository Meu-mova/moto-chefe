-- Entrada de peças pela NF-e (#341, #426).

-- Custo da última nota de entrada. Só registro: não mexe no preço de venda (P2).
alter table pecas_catalogo add column custo numeric(10, 2);

-- Alvo da FK composta do vínculo: o par (Conta, peça) é o que o vínculo pode apontar.
alter table pecas_catalogo add constraint pecas_catalogo_conta_id_id_key unique (conta_id, id);

-- "Este item deste fornecedor é esta peça", por Conta. nome_xml é o xProd lido como o
-- x_prod das motos (ADR-0008); o código sozinho não basta, porque o fornecedor repete
-- o cProd entre cores. A FK composta impede vínculo apontando para peça de outra Conta.
create table pecas_vinculo_fornecedor (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas(id),
  fornecedor_cnpj text not null,
  codigo text not null,
  nome_xml text not null,
  peca_id uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pecas_vinculo_fornecedor_chave_key unique (conta_id, fornecedor_cnpj, codigo, nome_xml),
  constraint pecas_vinculo_fornecedor_peca_da_conta_fkey
    foreign key (conta_id, peca_id) references pecas_catalogo (conta_id, id)
);

-- Cada lançamento de nota de entrada. Sem unique na chave: nota repetida é aviso, não
-- bloqueio. O grupo é o CNPJ da loja que recebeu, como em nfe_recebidas.
create table notas_entrada (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas(id),
  grupo_id uuid not null references grupos(id),
  loja_id uuid not null references lojas(id),
  chave_acesso text not null,
  numero text not null,
  fornecedor_cnpj text not null,
  criado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now()
);
create index notas_entrada_grupo_id_chave_acesso_idx on notas_entrada (grupo_id, chave_acesso);

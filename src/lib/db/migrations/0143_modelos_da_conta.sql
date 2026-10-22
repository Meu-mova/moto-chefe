-- Modelo da Conta (#321, adendo ao ADR-0018). Nulo = catálogo da plataforma.
alter table modelos add column conta_id uuid references contas(id);
create index modelos_conta_id_idx on modelos (conta_id);

-- Apelido da NF único dentro da Conta, não na base toda: senão a Conta B não usa o
-- apelido que a A já usa, e o "já existe" revela o modelo da A. conta_id repete o do
-- modelo; os da plataforma (nulos) continuam únicos entre si.
alter table modelo_apelidos add column conta_id uuid references contas(id);
alter table modelo_apelidos drop constraint modelo_apelidos_pkey;
create unique index modelo_apelidos_conta_apelido_key on modelo_apelidos (conta_id, apelido) nulls not distinct;

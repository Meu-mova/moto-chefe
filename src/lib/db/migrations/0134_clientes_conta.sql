-- Comprador (cliente) por Conta (ADR-0018, #195): cada Conta só vê os próprios
-- clientes, e o CPF/CNPJ passa a ser único dentro da Conta, não no sistema todo.

alter table clientes add column conta_id uuid references contas(id);

-- 1. Cliente ligado a registros (venda, OS, agenda, venda de peça, cupom) vai para a
--    Conta da loja desses registros.
create temporary table cliente_conta on commit drop as
with ref as (
  select v.cliente_id c, v.loja_id l from vendas v where v.cliente_id is not null
  union all select o.cliente_id, o.loja_id from ordens_servico o where o.cliente_id is not null
  union all select a.cliente_id, a.loja_id from agendamentos a where a.cliente_id is not null
  union all select p.cliente_id, p.loja_id from vendas_pecas p where p.cliente_id is not null
  union all select r.cliente_id, r.loja_id from cupons_revisao r where r.cliente_id is not null
)
select ref.c cliente_id, array_agg(distinct g.conta_id) contas
from ref join lojas lo on lo.id = ref.l join grupos g on g.id = lo.grupo_id
group by ref.c;

-- Cliente de duas Contas não tem dono certo: para em vez de escolher.
do $$
declare n int;
begin
  select count(*) into n from cliente_conta where cardinality(contas) > 1;
  if n > 0 then
    raise exception 'clientes ligados a mais de uma Conta: %', n;
  end if;
end $$;

update clientes c set conta_id = cc.contas[1]
from cliente_conta cc where cc.cliente_id = c.id;

-- 2. Sem vínculo (importação do Bling de 26/06/2026 e cadastros à mão): vão para a
--    única Conta que tem usuários, porque só alguém dela pode tê-los criado. Com mais
--    de uma Conta com usuários não há como saber: para.
do $$
declare
  sem_vinculo int;
  contas_com_usuarios uuid[];
begin
  select count(*) into sem_vinculo from clientes where conta_id is null;
  if sem_vinculo = 0 then return; end if;
  select array_agg(distinct conta_id) into contas_com_usuarios from usuarios where conta_id is not null;
  if coalesce(cardinality(contas_com_usuarios), 0) <> 1 then
    raise exception '% clientes sem vínculo e % Contas com usuários: não há dono certo',
      sem_vinculo, coalesce(cardinality(contas_com_usuarios), 0);
  end if;
  update clientes set conta_id = contas_com_usuarios[1] where conta_id is null;
end $$;

alter table clientes alter column conta_id set not null;

alter table clientes drop constraint clientes_cpf_cnpj_key;
alter table clientes add constraint clientes_conta_cpf_cnpj_key unique (conta_id, cpf_cnpj);

create index clientes_conta_id_idx on clientes (conta_id);

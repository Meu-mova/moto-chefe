-- Maquininhas de cartão por grupo (#460). Antes eram lista fixa no código e apareciam para
-- todas as Contas. As três atuais são só dos grupos da MotoChefe, achados pelo CNPJ como na
-- 0141 (Sul de Minas, BH e Vale). Grupo que não existe no banco não ganha linha.
create table if not exists maquininhas (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references grupos(id),
  nome      text not null,
  -- Código gravado no pagamento e usado pela conciliação ('infinitypay', 'stone', 'pagueveloz').
  operadora text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (grupo_id, operadora)
);

insert into maquininhas (grupo_id, nome, operadora)
select g.id, m.nome, m.operadora
from grupos g
cross join (values ('InfinityPay', 'infinitypay'), ('Stone', 'stone'), ('PagueVeloz', 'pagueveloz')) as m(nome, operadora)
where regexp_replace(g.cnpj, '\D', '', 'g') in ('57113017000172', '63009605000163', '65126949000188')
on conflict (grupo_id, operadora) do nothing;

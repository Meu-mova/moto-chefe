-- Conta: o cliente do MOVA, acima do grupo (ADR-0018, #193).
-- Cada grupo pertence a uma Conta; o usuário tem uma Conta de origem (admin_geral,
-- que é da plataforma, fica sem).

create table contas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  criado_em timestamptz not null default now()
);

alter table grupos   add column conta_id uuid references contas(id);
alter table usuarios add column conta_id uuid references contas(id);

-- Hoje os grupos de um mesmo dono só se ligam por usuários que tocam mais de um
-- (loja + grupos_acesso). Grupos ligados assim, direta ou indiretamente, viram uma
-- Conta; grupo sem ligação vira uma Conta sozinho. Sem nome de grupo fixo: staging e
-- produção têm grupos diferentes.
create temporary table grupo_componente on commit drop as
with recursive toca as (
  select u.id uid, l.grupo_id gid from usuarios u join lojas l on l.id = u.loja_id
  union
  select u.id, x from usuarios u cross join unnest(u.grupos_acesso) x
),
arestas as (select a.gid a, b.gid b from toca a join toca b on a.uid = b.uid),
alcance(grupo, alvo) as (
  select id, id from grupos
  union
  select al.grupo, ar.b from alcance al join arestas ar on ar.a = al.alvo
)
select grupo, min(alvo::text) raiz from alcance group by grupo;

create temporary table componente_conta on commit drop as
select raiz, gen_random_uuid() conta_id from (select distinct raiz from grupo_componente) r;

insert into contas (id, nome)
select cc.conta_id, string_agg(g.nome, ' + ' order by g.nome)
from componente_conta cc
join grupo_componente gc on gc.raiz = cc.raiz
join grupos g on g.id = gc.grupo
group by cc.conta_id;

update grupos g set conta_id = cc.conta_id
from grupo_componente gc join componente_conta cc on cc.raiz = gc.raiz
where gc.grupo = g.id;

alter table grupos alter column conta_id set not null;

-- Conta do usuário: a do grupo da loja dele; sem loja, a do primeiro grupo do
-- grupos_acesso (todos caem na mesma Conta, pela ligação acima). admin_geral fica sem.
update usuarios u set conta_id = g.conta_id
from lojas l join grupos g on g.id = l.grupo_id
where l.id = u.loja_id and u.papel <> 'admin_geral';

update usuarios u set conta_id = g.conta_id
from grupos g
where u.conta_id is null and u.papel <> 'admin_geral' and g.id = u.grupos_acesso[1];

create index grupos_conta_id_idx on grupos (conta_id);
create index usuarios_conta_id_idx on usuarios (conta_id);

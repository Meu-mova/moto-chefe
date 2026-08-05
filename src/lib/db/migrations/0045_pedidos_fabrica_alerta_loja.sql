-- O alerta passou a ser por loja: cada loja tem sua conta no portal e sua
-- própria fila de "aguardando pagamento". A unique por grupo faria duas lojas
-- da mesma bandeira se atropelarem no controle de "pendente há N dias".
alter table "pedidos_fabrica_alerta" add column if not exists "loja_id" uuid references "lojas"("id") on delete cascade;

-- As linhas existentes vieram do login do grupo, que hoje é a conta de Pouso
-- Alegre (Sul de Minas) e de Raja BH (BH).
update "pedidos_fabrica_alerta" a
set "loja_id" = l."id"
from "grupos" g
join "lojas" l on l."grupo_id" = g."id"
where g."id" = a."grupo_id"
  and l."nome" = case g."nome" when 'Sul de Minas' then 'Pouso Alegre' when 'BH' then 'Raja BH' end;

-- Sobra de grupo sem loja correspondente: é só memória de alerta, e sem loja
-- não há como saber de qual conta veio.
delete from "pedidos_fabrica_alerta" where "loja_id" is null;

alter table "pedidos_fabrica_alerta" alter column "loja_id" set not null;
-- O UNIQUE (grupo_id, numero_pedido) da 0038 era inline, sem nome explícito —
-- o Postgres batizou como abaixo (não como o rótulo "curto" que se esperaria).
alter table "pedidos_fabrica_alerta" drop constraint if exists "pedidos_fabrica_alerta_grupo_id_numero_pedido_key";
alter table "pedidos_fabrica_alerta" add constraint "pedidos_fabrica_alerta_loja_pedido_key" unique ("loja_id", "numero_pedido");

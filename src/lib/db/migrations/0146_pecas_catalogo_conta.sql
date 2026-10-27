-- Catálogo de peças por Conta (#195): cada Conta só vê as próprias peças; as lojas da
-- mesma Conta compartilham o catálogo.
--
-- Todo o catálogo atual é da rede original (decisão do Luis, 26/10/2026). Sem id fixo:
-- a Conta sai das lojas que usaram as peças (venda de peça e OS). Se nenhuma peça foi
-- usada, vale a Conta do grupo da rede original, achada pelo CNPJ como na 0141. Se as
-- peças foram usadas por mais de uma Conta, ou não há dono, para em vez de escolher.
alter table pecas_catalogo add column conta_id uuid references contas(id);

do $$
declare
  contas_uso uuid[];
  dona uuid;
begin
  if not exists (select 1 from pecas_catalogo) then return; end if;

  select array_agg(distinct g.conta_id) into contas_uso
  from (
    select v.loja_id from vendas_pecas_itens i join vendas_pecas v on v.id = i.venda_peca_id
    union all
    select o.loja_id from os_itens i join ordens_servico o on o.id = i.os_id where i.peca_id is not null
  ) uso
  join lojas l on l.id = uso.loja_id
  join grupos g on g.id = l.grupo_id;

  if coalesce(cardinality(contas_uso), 0) > 1 then
    raise exception 'peças usadas por % Contas: não há dono certo', cardinality(contas_uso);
  end if;

  dona := coalesce(
    contas_uso[1],
    (select conta_id from grupos where regexp_replace(cnpj, '\D', '', 'g') = '57113017000172')
  );
  if dona is null then
    raise exception 'catálogo de peças sem Conta dona';
  end if;

  update pecas_catalogo set conta_id = dona where conta_id is null;
end $$;

alter table pecas_catalogo alter column conta_id set not null;

create index pecas_catalogo_conta_id_idx on pecas_catalogo (conta_id);

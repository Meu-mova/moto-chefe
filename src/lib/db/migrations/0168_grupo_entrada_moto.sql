-- NF de saída pelo grupo que comprou a moto (#552).
-- Depende da 0167 (#556): a lista de tipos do log abaixo já inclui o tipo dela.

-- Chave por Conta: transferência entre grupos da mesma Conta. Só o admin_geral liga.
alter table contas add column if not exists transferencia_entre_grupos boolean not null default false;

-- Grupo que comprou a moto (destinatário da NF de entrada).
alter table motos add column if not exists grupo_entrada_id uuid references grupos(id);

-- Motos antigas, nesta ordem:
-- 1) a NF de entrada da moto (motos_fiscal.nf_chave) chegou pela SEFAZ a um grupo da
--    mesma Conta da loja (nfe_recebidas guarda o grupo destinatário); só se for um grupo só;
update motos m set grupo_entrada_id = d.grupo_id
from (
  select mf.moto_id, min(r.grupo_id::text)::uuid as grupo_id
  from motos_fiscal mf
  join motos mm on mm.id = mf.moto_id
  join lojas l on l.id = mm.loja_id
  join grupos gl on gl.id = l.grupo_id
  join nfe_recebidas r on r.chave = mf.nf_chave
  join grupos gr on gr.id = r.grupo_id and gr.conta_id = gl.conta_id
  where mf.nf_chave is not null
  group by mf.moto_id
  having count(distinct r.grupo_id) = 1
) d
where m.id = d.moto_id and m.grupo_entrada_id is null;

-- 2) senão, o grupo da loja de origem da primeira transferência aceita (mesma Conta);
update motos m set grupo_entrada_id = t.grupo_id
from (
  select distinct on (tr.moto_id) tr.moto_id, lo.grupo_id
  from transferencias tr
  join lojas lo on lo.id = tr.loja_origem_id
  join motos mm on mm.id = tr.moto_id
  join lojas la on la.id = mm.loja_id
  join grupos gor on gor.id = lo.grupo_id
  join grupos ga on ga.id = la.grupo_id and ga.conta_id = gor.conta_id
  where tr.status = 'aceita'
  order by tr.moto_id, tr.data_solicitacao
) t
where m.id = t.moto_id and m.grupo_entrada_id is null;

-- 3) senão, o grupo da loja atual.
update motos m set grupo_entrada_id = l.grupo_id
from lojas l
where l.id = m.loja_id and m.grupo_entrada_id is null;

-- Moto nova: grupo da loja onde entrou. Trigger cobre todo insert (XML, planilha,
-- manual, garantia e RPCs) sem depender de cada tela lembrar.
create or replace function motos_grupo_entrada() returns trigger language plpgsql as $$
begin
  if new.grupo_entrada_id is null then
    select l.grupo_id into new.grupo_entrada_id from lojas l where l.id = new.loja_id;
  end if;
  return new;
end $$;

drop trigger if exists motos_grupo_entrada on motos;
create trigger motos_grupo_entrada before insert on motos
  for each row execute function motos_grupo_entrada();

alter table motos alter column grupo_entrada_id set not null;

alter table log_acoes drop constraint log_acoes_tipo_check;
alter table log_acoes add constraint log_acoes_tipo_check check (tipo in (
  'login', 'troca_grupo', 'acesso_dia',
  'venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada',
  'certificado_aplicado', 'portal_aplicado', 'notas_enviadas_contador',
  'logo_danfe_enviada', 'preco_compra_alterado', 'grupo_movido_de_conta',
  'transferencia_grupos_alterada'
));

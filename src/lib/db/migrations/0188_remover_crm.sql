-- Remove o schema `crm`, de um teste antigo de CRM que não é usado pelo MOVA (#927). Só um dos bancos o tem;
-- nos outros (CI, staging) cada passo não acha nada e segue. Pode rodar de novo.
-- Ordem: o gatilho do cadastro de usuário chama uma função do crm; ele sai primeiro e pelo nome, sem depender
-- do cascade do schema.

-- 1. Gatilho em auth.users. O banco do CI não tem auth.users: o drop só roda onde a tabela existe.
do $$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists crm_on_auth_user_created on auth.users;
  end if;
end $$;

-- 2. Tabelas do crm no realtime, lidas do catálogo: sem lista fixa, nenhuma fica para trás calada.
do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'crm'
  loop
    execute format('alter publication supabase_realtime drop table %I.%I', t.schemaname, t.tablename);
  end loop;
end $$;

-- 3. O schema, com tabelas e funções.
drop schema if exists crm cascade;

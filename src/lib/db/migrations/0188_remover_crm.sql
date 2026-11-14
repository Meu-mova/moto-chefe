-- Remove o schema `crm`, de um teste antigo de CRM que não é usado pelo MOVA (#927). Só um dos bancos o tem;
-- nos outros (CI, staging) cada passo não acha nada e segue. Pode rodar de novo.
-- As tabelas do crm na publicação do realtime saem com elas, no cascade do schema.

-- 1. Gatilho do crm no cadastro de usuário, pelo nome. O banco do CI não tem auth.users: o drop só roda onde a
-- tabela existe.
do $$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists crm_on_auth_user_created on auth.users;
  end if;
end $$;

-- 2. O schema, com tabelas e funções.
drop schema if exists crm cascade;

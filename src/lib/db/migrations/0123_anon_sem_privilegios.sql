-- Reforço da 0122 (#16, #52), achados da revisão do #179. A 0122 fechou o acesso
-- sem login pelas policies e pelo EXECUTE das funções SECURITY DEFINER; aqui o
-- anon perde também os privilégios em si, para a proteção não depender só do RLS.
-- O app não usa o anon no schema public: telas pelo Drizzle (papel do banco),
-- rpc e a leitura de vendas pela sessão de usuário logado.

-- Tabelas, views e sequências: o anon não tem o que fazer aqui.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Funções: o Postgres dá EXECUTE a PUBLIC por padrão, e o anon herda por aí.
-- O usuário logado continua executando tudo, para nada do que ele já faz quebrar.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- SECURITY DEFINER que o app não chama pela sessão: rls_auto_enable é o gatilho
-- que liga o RLS em tabela nova (roda como dono) e expirar_garantias não tem
-- chamada no código.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('rls_auto_enable', 'expirar_garantias')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f);
  END LOOP;
END $$;

-- vendas_seguras é uma view sem security_invoker: roda com as permissões do dono
-- e ignora o RLS de vendas. Com security_invoker, respeita o RLS de quem consulta.
-- (A 0122 a chamou de SECURITY DEFINER; o efeito do REVOKE de lá está certo.)
DO $$
BEGIN
  IF to_regclass('public.vendas_seguras') IS NOT NULL THEN
    ALTER VIEW public.vendas_seguras SET (security_invoker = on);
  END IF;
END $$;

-- Objeto novo criado por este papel não nasce acessível ao anon. A 0122 revogou
-- só do anon, mas o EXECUTE padrão de função vem de PUBLIC.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

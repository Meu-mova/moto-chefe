-- #891: o login comum (papel `authenticated` do Supabase) deixa de acessar o schema
-- public direto pela API do Supabase. O app não depende disso: lê e grava pelo Drizzle
-- (papel do banco), e as funções do banco são chamadas pelo servidor. É o mesmo
-- fechamento que a 0123 fez para o `anon`.

-- Regras de acesso que liberam tudo (sem condição) deixam de existir.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- Tabelas, views e sequências: o login comum não tem o que fazer aqui.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;

-- Funções: ninguém além do app as executa. Funções de extensão ficam de fora,
-- como na 0123 (não são do app e não leem dado dele).
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- Objeto novo criado pelas migrações não nasce aberto ao login comum. O papel é
-- explícito: se as migrações rodarem com outro, isto falha em vez de não valer.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
-- O padrão por schema só soma ao padrão global, que dá EXECUTE a todos (PUBLIC) em
-- função nova; por isso a mesma linha da 0123, com IN SCHEMA, não valeu. Aqui, sem
-- IN SCHEMA, vale para toda função criada pelas migrações.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

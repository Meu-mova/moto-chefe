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

-- Tabelas, views e sequências: o login comum e o anônimo não têm o que fazer aqui,
-- nem por um privilégio dado a todos (PUBLIC).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

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

-- Objeto novo criado pelas migrações não nasce aberto ao login comum nem ao anônimo.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
-- O padrão por schema só soma ao padrão global, que dá EXECUTE a todos (PUBLIC) em
-- função nova; por isso a mesma linha da 0123, com IN SCHEMA, não valeu. Aqui, sem
-- IN SCHEMA, vale para toda função criada pelas migrações.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Conferência: um REVOKE sem efeito só avisa (objeto de outro dono, por exemplo) e a
-- migração passaria com acesso aberto. Sobrou algum, ela falha e nada fica gravado.
DO $$
DECLARE abertos text;
BEGIN
  SELECT string_agg(o, ', ' ORDER BY o) INTO abertos FROM (
    SELECT format('%s %I.%I', r.papel, n.nspname, c.relname) AS o
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('authenticated'), ('anon')) AS r(papel)
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
      AND (
        -- Coluna conta: um grant só de coluna também abre a tabela.
        (c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (has_table_privilege(r.papel, c.oid, 'DELETE, TRUNCATE, TRIGGER')
            OR has_any_column_privilege(r.papel, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')))
        OR (c.relkind = 'S' AND has_sequence_privilege(r.papel, c.oid, 'USAGE, SELECT, UPDATE'))
      )
    UNION ALL
    SELECT format('%s %s', r.papel, p.oid::regprocedure)
    FROM pg_proc p
    CROSS JOIN (VALUES ('authenticated'), ('anon')) AS r(papel)
    WHERE p.pronamespace = 'public'::regnamespace
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND has_function_privilege(r.papel, p.oid, 'EXECUTE')
    UNION ALL
    -- Padrão global (sem schema) ou do public; grantee 0 = PUBLIC.
    SELECT format('padrão %s para %s', d.defaclobjtype,
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END)
    FROM pg_default_acl d, aclexplode(d.defaclacl) a
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclnamespace IN (0, 'public'::regnamespace)
      AND a.grantee IN (0, 'authenticated'::regrole, 'anon'::regrole)
  ) x;
  IF abertos IS NOT NULL THEN
    RAISE EXCEPTION 'acesso direto aberto: %', abertos;
  END IF;
END $$;

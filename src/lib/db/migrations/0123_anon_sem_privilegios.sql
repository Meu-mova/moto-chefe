-- Reforço da 0122 (#16, #52), achados da revisão do #179. A 0122 fechou o acesso
-- sem login pelas policies e pelo EXECUTE das funções SECURITY DEFINER; aqui o
-- anon perde também os privilégios em si, para a proteção não depender só do RLS.
-- O app não usa o anon no schema public: telas pelo Drizzle (papel do banco),
-- rpc e a leitura de vendas pela sessão de usuário logado.

-- Tabelas, views e sequências: o anon não tem o que fazer aqui.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Funções: o Postgres dá EXECUTE a PUBLIC por padrão, e o anon herda por aí.
-- Funções de extensão ficam de fora: na produção a pgvector está instalada no
-- public (118 funções), no staging não, e mexer nelas não é o objetivo.
-- O usuário logado executa só o que precisa: as funções que o app chama por rpc
-- (src/app/**/actions.ts) e as usadas nas policies (is_admin, get_loja_id).
-- Gatilhos não precisam de EXECUTE de quem dispara; SECURITY DEFINER chamadas
-- por dentro de outra (get_papel, em is_admin) rodam como dono.
DO $$
DECLARE
  f record;
  logado text[] := ARRAY[
    'abrir_garantia','encerrar_garantia','mudar_status_moto',
    'solicitar_transferencia','aceitar_transferencia','recusar_transferencia',
    'criar_pedido_venda','cancelar_pedido_venda','efetivar_venda',
    'is_admin','get_loja_id'
  ];
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS fn, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.fn);
    IF f.proname = ANY (logado) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.fn);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.fn);
    END IF;
  END LOOP;
END $$;

-- vendas_seguras é uma view sem security_invoker: roda com as permissões do dono
-- e ignora o RLS de vendas. Com security_invoker, respeita o RLS de quem consulta.
DO $$
BEGIN
  IF to_regclass('public.vendas_seguras') IS NOT NULL THEN
    ALTER VIEW public.vendas_seguras SET (security_invoker = on);
  END IF;
END $$;

-- Objeto novo criado pelo papel que roda esta migração (o do migrate.ts) não
-- nasce acessível ao anon. A 0122 revogou só do anon, mas o EXECUTE padrão de
-- função vem de PUBLIC. Função nova chamada por rpc precisa de GRANT explícito
-- ao authenticated, como as da lista acima.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

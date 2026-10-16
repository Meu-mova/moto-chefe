-- #16: a chave anon do Supabase vai para o navegador (é pública por natureza) e,
-- com as policies abaixo valendo para o papel `public`, quem tivesse o endereço do
-- projeto lia vendas (CPF, celular, endereço) e usuarios sem login.
--
-- O app não lê nada como anon: as telas leem pelo Drizzle (papel do banco), as
-- funções chamadas por rpc são SECURITY DEFINER, e a única leitura direta pela
-- sessão (vendas, em vendas/actions.ts) é de usuário logado. Por isso a leitura
-- passa a valer só para `authenticated`.
--
-- Fora do escopo: o usuário logado ainda lê todos os grupos pela API do Supabase;
-- separar por cliente é a #164.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'configuracao_taxas','garantias','historico_estoque','lojas','modelos','motos',
    'ordens_servico','pedidos_venda','precificacao','transferencias','usuarios','vendas'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS leitura_global ON public.%I', t);
      EXECUTE format('CREATE POLICY leitura_global ON public.%I FOR SELECT TO authenticated USING (true)', t);
    END IF;
  END LOOP;
END $$;

-- Inserir no histórico de estoque também estava aberto para quem não tem login.
DROP POLICY IF EXISTS historico_apenas_insert ON public.historico_estoque;
CREATE POLICY historico_apenas_insert ON public.historico_estoque
  FOR INSERT TO authenticated WITH CHECK (true);

-- vendas_seguras é SECURITY DEFINER (ignora o RLS de vendas) e o app não a usa.
DO $$
BEGIN
  IF to_regclass('public.vendas_seguras') IS NOT NULL THEN
    REVOKE ALL ON public.vendas_seguras FROM anon, authenticated;
  END IF;
END $$;

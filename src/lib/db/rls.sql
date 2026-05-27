-- Execute este arquivo no Supabase SQL Editor

-- Habilitar RLS em todas as tabelas
ALTER TABLE lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE motos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantias ENABLE ROW LEVEL SECURITY;

-- Helper: retorna papel do usuário atual
CREATE OR REPLACE FUNCTION get_papel()
RETURNS text AS $$
  SELECT papel FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: retorna loja_id do usuário atual
CREATE OR REPLACE FUNCTION get_loja_id()
RETURNS uuid AS $$
  SELECT loja_id FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: é admin_geral?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT get_papel() = 'admin_geral'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- LEITURA GLOBAL (todos veem tudo)
CREATE POLICY "leitura_global" ON lojas FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON modelos FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON motos FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON pedidos_venda FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON transferencias FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON historico_estoque FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON ordens_servico FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON garantias FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON usuarios FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON vendas FOR SELECT USING (true);

-- ESCRITA: admin pode tudo
CREATE POLICY "admin_escrita_total" ON motos FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON pedidos_venda FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON vendas FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON transferencias FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON historico_estoque FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON ordens_servico FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON garantias FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON lojas FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON usuarios FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON modelos FOR ALL USING (is_admin());

-- ESCRITA por loja: motos (UPDATE)
CREATE POLICY "escrita_por_loja_motos" ON motos
  FOR UPDATE USING (loja_id = get_loja_id() AND NOT is_admin());

-- ESCRITA por loja: pedidos_venda (INSERT)
CREATE POLICY "inserir_pedido_venda" ON pedidos_venda
  FOR INSERT WITH CHECK (loja_id = get_loja_id() OR is_admin());

-- ESCRITA por loja: garantias
CREATE POLICY "escrita_por_loja_garantias" ON garantias
  FOR ALL USING (loja_id = get_loja_id() AND NOT is_admin());

-- ESCRITA por loja: ordens_servico
CREATE POLICY "escrita_por_loja_os" ON ordens_servico
  FOR ALL USING (loja_id = get_loja_id() AND NOT is_admin());

-- historico_estoque: somente INSERT (log imutável)
CREATE POLICY "historico_apenas_insert" ON historico_estoque
  FOR INSERT WITH CHECK (true);

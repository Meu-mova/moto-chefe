-- Contribuinte de ICMS e inscrição estadual do comprador CNPJ (#65). A NF-e leva
-- o indicador (indIEDest) e, para contribuinte, a IE. Vai na venda (é de onde a
-- NF lê o comprador) e no cadastro do cliente (a busca por CNPJ pré-preenche).
-- Vazio = não contribuinte, que é o caso de toda venda anterior.
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS cliente_indicador_ie text,
  ADD COLUMN IF NOT EXISTS cliente_inscricao_estadual text;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS indicador_ie text,
  ADD COLUMN IF NOT EXISTS inscricao_estadual text;

ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_cliente_indicador_ie_check;
ALTER TABLE vendas ADD CONSTRAINT vendas_cliente_indicador_ie_check
  CHECK (cliente_indicador_ie IN ('contribuinte', 'isento', 'nao_contribuinte'));

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_indicador_ie_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_indicador_ie_check
  CHECK (indicador_ie IN ('contribuinte', 'isento', 'nao_contribuinte'));

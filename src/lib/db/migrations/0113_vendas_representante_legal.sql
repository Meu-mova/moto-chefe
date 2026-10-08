-- Representante legal na venda para pessoa jurídica (#65): quem assina o
-- contrato pela empresa. Fica na venda, não no cliente: a mesma empresa pode
-- mandar pessoas diferentes em cada compra.
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS representante_nome text,
  ADD COLUMN IF NOT EXISTS representante_cpf  text;

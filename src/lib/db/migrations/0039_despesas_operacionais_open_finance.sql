-- O card "Despesas Operacionais" do /financeiro passa a somar as saídas do Importar
-- do Banco (despesas_open_finance) em vez dos lançamentos manuais. Mas o extrato traz
-- tudo que saiu da conta, e nem toda saída é custo de operar a loja:
--
--   * compra de moto pra fábrica — é custo de mercadoria, já embutido no líquido de
--     cada venda; contar aqui de novo derrubaria o lucro em milhões
--   * retirada de sócio — distribuição de lucro, não custo
--
-- Duas formas de marcar, porque metade das saídas grandes nem categoria tem:
--   1. flag na categoria (quando a saída foi categorizada no Importar do Banco)
--   2. CNPJ do favorecido (pega as não categorizadas — é como a fábrica aparece no extrato)

ALTER TABLE categorias_despesa
  ADD COLUMN IF NOT EXISTS conta_como_despesa boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN categorias_despesa.conta_como_despesa IS
  'false = saída real, mas não é custo de operar a loja (compra de mercadoria, retirada de sócio). Fica de fora do card Despesas Operacionais do /financeiro.';

UPDATE categorias_despesa SET conta_como_despesa = false
WHERE nome IN ('Compra de Motos', 'Retiradas', 'Cesar', 'Mateus', 'João', 'Luis Paulo');

-- CNPJ guardado só com dígitos: no extrato ele aparece formatado de jeitos diferentes
-- ("53.780.554 0001-15" no favorecido, "53780554000115" no meio da descrição do PIX).
CREATE TABLE IF NOT EXISTS favorecidos_nao_operacionais (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id   uuid NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  cnpj       text NOT NULL,
  rotulo     text NOT NULL,
  motivo     text NOT NULL DEFAULT 'compra_moto',
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, cnpj)
);

COMMENT ON TABLE favorecidos_nao_operacionais IS
  'Favorecidos cujas saídas não entram no card Despesas Operacionais. Hoje: fábricas de moto.';

-- Os dois fornecedores de moto do Sul de Minas, confirmados pela descrição do PIX
-- ("Motos RJ" e "motos") e pelo volume: 36 transações cada, R$ 5,02M somados.
INSERT INTO favorecidos_nao_operacionais (grupo_id, cnpj, rotulo, motivo)
SELECT g.id, v.cnpj, v.rotulo, 'compra_moto'
FROM grupos g
CROSS JOIN (VALUES
  ('53780554000115', 'Motos RJ'),
  ('09089839000112', 'Fábrica (motos)')
) AS v(cnpj, rotulo)
WHERE g.nome = 'Sul de Minas'
ON CONFLICT (grupo_id, cnpj) DO NOTHING;

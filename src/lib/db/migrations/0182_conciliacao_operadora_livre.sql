-- Cielo na conciliação (#656). Duas travas da tabela impediam a importação de funcionar.

-- 1) A operadora é dado do grupo (maquininha cadastrada, #460/#471) e a Server Action já confere a
--    maquininha antes de gravar. A lista fixa de 3 nomes recusava a Cielo e qualquer outra.
ALTER TABLE conciliacoes_cartao DROP CONSTRAINT IF EXISTS conciliacoes_cartao_operadora_check;

-- 2) O NSU repetido era barrado no sistema inteiro. Vale por grupo: a mesma transação, por grupo, não
--    entra duas vezes, e o código de uma Conta não derruba a importação de outra (isolamento).
DROP INDEX IF EXISTS idx_conciliacoes_cartao_nsu;
CREATE UNIQUE INDEX idx_conciliacoes_cartao_nsu
  ON conciliacoes_cartao (grupo_id, operadora, nsu) WHERE nsu IS NOT NULL;

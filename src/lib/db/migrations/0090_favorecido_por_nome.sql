-- Favorecido não-operacional também pelo NOME, não só pelo CNPJ.
--
-- A Stone não manda CNPJ nenhum no extrato — o payload do Open Finance vem
-- `{"paymentMethod":"PIX","receiver":"Q.P.A DISTRIBUICAO LTDA"}`. Como a única
-- regra era por dígitos de CNPJ, ao liberar a Stone do Sul de Minas entrariam
-- no card R$ 761 mil de compra de fábrica e R$ 548 mil de varredura pra conta
-- própria como se fossem custo de operar a loja.
--
-- O CNPJ deixa de ser obrigatório porque existe favorecido que só dá pra
-- reconhecer pelo nome (a ECOMOV, que é a própria empresa do grupo no extrato
-- da maquininha). O CHECK garante que a linha sempre tenha ao menos uma das
-- duas chaves — cadastro sem nenhuma nunca casaria com nada.

ALTER TABLE favorecidos_nao_operacionais
  ADD COLUMN IF NOT EXISTS nome_padrao text;

ALTER TABLE favorecidos_nao_operacionais
  ALTER COLUMN cnpj DROP NOT NULL;

ALTER TABLE favorecidos_nao_operacionais
  DROP CONSTRAINT IF EXISTS favorecidos_nao_operacionais_chave_check;

ALTER TABLE favorecidos_nao_operacionais
  ADD CONSTRAINT favorecidos_nao_operacionais_chave_check
  CHECK (cnpj IS NOT NULL OR nome_padrao IS NOT NULL);

-- O índice único de (grupo_id, cnpj) não alcança as linhas só-nome: no Postgres
-- NULL não conflita com NULL, então dava pra cadastrar a mesma empresa N vezes.
CREATE UNIQUE INDEX IF NOT EXISTS favorecidos_nao_operacionais_grupo_nome_key
  ON favorecidos_nao_operacionais (grupo_id, lower(nome_padrao))
  WHERE nome_padrao IS NOT NULL;

-- ── Nome das que já estavam cadastradas por CNPJ ─────────────────────────────
-- Mesma empresa, segunda chave. Quem paga pela Sicoob continua sendo pego pelo
-- CNPJ; quem paga pela Stone passa a ser pego pelo nome.

UPDATE favorecidos_nao_operacionais
   SET nome_padrao = 'Q.P.A Distribuicao'
 WHERE cnpj = '53780554000115';

UPDATE favorecidos_nao_operacionais
   SET nome_padrao = 'Laiouns'
 WHERE cnpj = '09089839000112';

-- Razão social de cada grupo, do jeito que a contraparte aparece no extrato:
-- "MOTOCHEFE SUL DE MINAS LTDA" e "PRIME MOBILIDADE ELETRICA LTDA".
UPDATE favorecidos_nao_operacionais
   SET nome_padrao = 'Motochefe'
 WHERE cnpj = '57113017000172';

UPDATE favorecidos_nao_operacionais
   SET nome_padrao = 'Prime Mobilidade Eletrica'
 WHERE cnpj = '63009605000163';

-- ── ECOMOV: empresa do grupo que só aparece pelo nome ────────────────────────
-- É o nome que a Stone escreve na varredura da maquininha pra conta principal
-- ("Transferência | Pix | ECOMOV MOBILIDADE LTDA", R$ 548 mil). Não temos o
-- CNPJ dela em lugar nenhum do extrato — daí a linha só-nome. Entra nos três
-- grupos, como já é feito com o CNPJ de cada grupo: dinheiro andando entre as
-- empresas do grupo não é despesa em nenhum dos lados.
INSERT INTO favorecidos_nao_operacionais (grupo_id, cnpj, rotulo, nome_padrao, motivo)
SELECT g.id, NULL, 'Ecomov Mobilidade (empresa do grupo)', 'Ecomov', 'transferencia_interna'
  FROM grupos g
 WHERE NOT EXISTS (
   SELECT 1 FROM favorecidos_nao_operacionais f
    WHERE f.grupo_id = g.id AND lower(f.nome_padrao) = 'ecomov'
 );

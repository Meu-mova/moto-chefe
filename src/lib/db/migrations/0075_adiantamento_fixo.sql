-- 0075_adiantamento_fixo.sql
-- Adiantamento que se repete todo mês (vale fixo combinado com a pessoa), ao lado
-- de salário e ajuda de custo na configuração do funcionário.
--
-- NÃO substitui folha_adiantamentos (migração 0074): aquela tabela continua sendo o
-- lugar do adiantamento eventual, lançado num mês específico. Os dois descontam do
-- total a pagar e se somam — quem tem vale fixo de R$ 500 e pegou mais R$ 300 num
-- mês desconta R$ 800 naquele mês.
--
-- NULL = sem vale fixo, mesma convenção de ajuda_custo (0 seria "combinado, mas
-- zerado", e a tela precisa distinguir os dois para deixar o campo em branco).
ALTER TABLE funcionarios_config
  ADD COLUMN IF NOT EXISTS adiantamento_fixo numeric(10,2);

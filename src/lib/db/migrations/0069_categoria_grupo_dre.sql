-- Grupo do DRE em cada categoria de despesa.
--
-- O /financeiro mostra as despesas operacionais como uma lista de 39 categorias.
-- Isso responde "quanto gastamos com aluguel", mas não responde "quanto pesa a
-- estrutura" — que é a pergunta do demonstrativo. O grupo é a ponte: várias
-- categorias viram uma linha do DRE.
--
-- Fica na categoria, e não num de-para no código, porque categoria nova nasce
-- toda semana pela tela de Admin. No código, toda categoria nova entraria calada
-- em "Outras" até alguém abrir um chamado.
--
-- Categoria não operacional fica com NULL: ela não entra no corpo do DRE, aparece
-- no memorando (retirada de sócio, compra de mercadoria) e o motivo já a
-- classifica lá.
--
-- O preenchimento abaixo é uma PROPOSTA, para o Cesar corrigir na tela. Duas que
-- merecem conferência: "Manutenção" foi para Ocupação assumindo manutenção
-- predial (se for de veículo, é Logística), e "Dinheiro p/Cx de loja" ficou em
-- Outras — provavelmente nem deveria ser despesa operacional, é dinheiro mudando
-- de bolso dentro da própria loja.
ALTER TABLE categorias_despesa
  ADD COLUMN IF NOT EXISTS grupo_dre text;

COMMENT ON COLUMN categorias_despesa.grupo_dre IS
  'Linha do DRE: pessoal, ocupacao, comerciais, administrativas, logistica, tributos, oficina, outras. NULL cai em "Outras" na leitura.';

UPDATE categorias_despesa SET grupo_dre = 'pessoal'
 WHERE conta_como_despesa AND nome IN (
   'Salários', 'Pró-Labore', 'Rescisão funcionário', 'Alimentação', 'Segurança do Trabalho'
 );

UPDATE categorias_despesa SET grupo_dre = 'ocupacao'
 WHERE conta_como_despesa AND nome IN (
   'Aluguel', 'Energia elétrica', 'Água', 'Internet', 'Telefone', 'Celulares',
   'Segurança', 'Obra BH', 'Obra Pouso Alegre', 'Manutenção'
 );

UPDATE categorias_despesa SET grupo_dre = 'comerciais'
 WHERE conta_como_despesa AND nome IN ('Marketing', 'Frete entrega cliente');

UPDATE categorias_despesa SET grupo_dre = 'administrativas'
 WHERE conta_como_despesa AND nome IN (
   'Contabilidade', 'Jurídico', 'BLING SISTEMA', 'Compra material escritório',
   'Franquia', 'Franquia Lojas', 'Seguros', 'Despesa lançada manual'
 );

UPDATE categorias_despesa SET grupo_dre = 'logistica'
 WHERE conta_como_despesa AND nome IN (
   'Combustivel', 'Combustível', 'Pedágio', 'Carro HB20 ITACAR', 'Furgão',
   'Saveiro ( empréstimo)', 'Frete Compra Motos', 'Despesa Viagem e Hotel'
 );

UPDATE categorias_despesa SET grupo_dre = 'tributos'
 WHERE conta_como_despesa AND nome IN ('Impostos', 'TX Banco');

UPDATE categorias_despesa SET grupo_dre = 'oficina'
 WHERE conta_como_despesa AND nome IN ('Material Oficina');

-- O que sobrou de operacional e não coube em nenhum grupo acima.
UPDATE categorias_despesa SET grupo_dre = 'outras'
 WHERE conta_como_despesa AND grupo_dre IS NULL;

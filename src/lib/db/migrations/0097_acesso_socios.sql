-- src/lib/db/migrations/0097_acesso_socios.sql
-- Primeira carga de grupos_acesso (ver 0096) — por e-mail, não por id, porque
-- é isso que o Cesar tem na cabeça e o que sobrevive se o id mudar de banco
-- (staging/produção). admin_geral (admin@motochefe.com e
-- cesar.rodrigues@motochefesuldeminas.com.br) não entra aqui: o papel já vê
-- todos os grupos, listar seria redundante e daria a entender, errado, que
-- a lista é que manda para esse papel.
--
-- Ids de grupo (ver src/lib/grupo.ts e cadastro de grupos):
--   Sul de Minas 00000000-0000-4000-8000-000000000001
--   BH           227fde12-cce6-46a3-8212-2771be008c2f
--   Vale         4cd6268b-680b-4861-8649-63c861b03e53

-- João Brito: já aprova venda nos três grupos (grupos_aprovacao) desde a
-- fusão multi-grupo — é o sócio que efetivamente circula entre Sul de Minas,
-- BH e Vale. Ver acesso ao mesmo nível que já aprova.
UPDATE usuarios
SET grupos_acesso = ARRAY[
  '00000000-0000-4000-8000-000000000001',
  '227fde12-cce6-46a3-8212-2771be008c2f',
  '4cd6268b-680b-4861-8649-63c861b03e53'
]::uuid[]
WHERE email = 'joao.brito@motochefesuldeminas.com.br';

-- Luiz Paulo, Marina Paiva e Mateus: sócios de Sul de Minas + BH (o Vale ainda
-- não é operação deles) — mesmo par de grupos que já usam para aprovar venda.
UPDATE usuarios
SET grupos_acesso = ARRAY[
  '00000000-0000-4000-8000-000000000001',
  '227fde12-cce6-46a3-8212-2771be008c2f'
]::uuid[]
WHERE email IN (
  'luiz.paulo@motochefesuldeminas.com.br',
  'marina.paiva@motochefesuldeminas.com.br',
  'mateus@motochefesuldeminas.com.br'
);

-- admin.teste@mova.dev: conta de teste com papel de sócio (vê/troca de grupo)
-- num sistema que vai ser vendido para lojistas de fora — desativa em vez de
-- só zerar o acesso, porque o problema não é só QUAL grupo ela vê, é ela
-- existir com esse poder num ambiente comercial.
UPDATE usuarios
SET ativo = false
WHERE email = 'admin.teste@mova.dev';

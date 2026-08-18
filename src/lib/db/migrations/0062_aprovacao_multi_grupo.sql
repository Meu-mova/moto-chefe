-- Aprovação por grupo, configurável por usuário.
--
-- Antes: quem aprovava venda abaixo do preço era o admin_socio SÓ no grupo da
-- própria loja fixa, e quem aprovava financiamento/transferência era um único
-- e-mail nominal no código (EMAIL_ACESSO_MULTI_GRUPO). Não havia como liberar
-- um sócio para um segundo grupo sem deploy.
--
-- Agora:
--   grupos_aprovacao          — grupos EXTRAS onde o usuário aprova, além do
--                               grupo da própria loja. Editável em /admin/usuarios.
--   aprova_pagamento_sensivel — libera financiamento/transferência, respeitando
--                               os mesmos grupos (loja + grupos_aprovacao).
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS grupos_aprovacao uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS aprova_pagamento_sensivel boolean NOT NULL DEFAULT false;

-- João Brito: sócio com loja fixa em Itajubá (Sul de Minas). Passa a aprovar
-- também no BH e no Vale, e passa a aprovar financiamento/transferência nos
-- três grupos. Decisão do Cesar (18/08/2026).
UPDATE usuarios
SET grupos_aprovacao = ARRAY(
      SELECT id FROM grupos WHERE ativo AND nome IN ('BH', 'Vale')
    ),
    aprova_pagamento_sensivel = true
WHERE email = 'joao.brito@motochefesuldeminas.com.br';

-- src/lib/db/migrations/0096_grupos_acesso.sql
-- Coluna separada de grupos_aprovacao de propósito: aprovar pagamento num
-- grupo e ENXERGAR aquele grupo (poder trocar para ele no seletor de empresa
-- e ler os dados dele) são coisas diferentes. Hoje qualquer admin_socio troca
-- o cookie grupoAtivo para qualquer grupo do banco, porque getGrupoAtivo()
-- só checava se o grupo existia e estava ativo — nunca se o usuário tinha
-- posse dele. Como quase toda página/action usa getGrupoAtivo() como prova de
-- escopo multi-tenant, isso é vazamento de dado entre tenants (CNPJs), não só
-- um detalhe de UI.
--
-- Vazio (default) preserva o comportamento de hoje para todo mundo: vendedor,
-- mecânico e aux_adm só veem o grupo da própria loja. A regra de resolução
-- fica em src/lib/acesso-grupo.ts (puro, testável sem banco).

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS grupos_acesso uuid[] NOT NULL DEFAULT '{}';

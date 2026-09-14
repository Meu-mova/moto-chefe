-- src/lib/db/migrations/0095_situacao_check.sql
-- Trava o domínio de nfe_recebidas.situacao ('resumo' | 'completa' |
-- 'cancelada') enquanto a tabela ainda está vazia — o backlog perdido no
-- cStat 656 de hoje (14/09/2026) zerou a tabela, então este é o momento mais
-- barato que vai existir pra este CHECK: com dado dentro, qualquer linha fora
-- do domínio (typo num INSERT futuro) bloquearia a migração até ser limpa.

ALTER TABLE nfe_recebidas
  ADD CONSTRAINT nfe_recebidas_situacao_check
  CHECK (situacao IN ('resumo', 'completa', 'cancelada'));

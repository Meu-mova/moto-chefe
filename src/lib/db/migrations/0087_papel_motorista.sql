-- Papel 'motorista' (04/09/2026).
--
-- Entra só para a folha de pagamento: o motorista não opera o sistema, mas
-- precisa existir como usuário para receber holerite e aparecer na folha do
-- grupo. O acesso dele está em @/lib/navegacao (Dashboard, Meus Documentos e
-- Calendário) — deliberadamente fora de TODOS, que abre a oficina inteira.
--
-- ADD VALUE sozinho no arquivo: o Postgres não deixa usar o valor novo na mesma
-- transação que o cria, então qualquer INSERT com 'motorista' vai em outro lote.
ALTER TYPE papel ADD VALUE IF NOT EXISTS 'motorista';

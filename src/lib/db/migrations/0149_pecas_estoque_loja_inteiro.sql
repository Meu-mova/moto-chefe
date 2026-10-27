-- Estoque de peças por loja em unidades inteiras (decisão do Luis, 27/10/2026). A 0147 criou
-- a coluna como numeric(10,2) e já foi aplicada; a tabela ainda está vazia em todo banco, e
-- o cast arredondaria se não estivesse.
alter table pecas_estoque_loja alter column quantidade type integer using quantidade::integer;

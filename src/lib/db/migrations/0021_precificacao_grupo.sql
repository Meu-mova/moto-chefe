-- precificacao: adicionar grupo_id e duplicar os dados existentes (do Sul de
-- Minas) para os 3 grupos, já que a tabela era global e vinha sendo editada
-- por qualquer sócio, de qualquer grupo, afetando todo mundo.
ALTER TABLE "precificacao" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");

UPDATE "precificacao" SET "grupo_id" = '00000000-0000-4000-8000-000000000001' WHERE "grupo_id" IS NULL;

INSERT INTO "precificacao" (grupo_id, nome, valor_minimo, taxa_pix, taxas_cartao, taxas_link, taxas_financiamento, custo, imagem_url, ativo, criado_em)
SELECT '227fde12-cce6-46a3-8212-2771be008c2f', nome, valor_minimo, taxa_pix, taxas_cartao, taxas_link, taxas_financiamento, custo, imagem_url, ativo, criado_em
FROM "precificacao" WHERE grupo_id = '00000000-0000-4000-8000-000000000001';

INSERT INTO "precificacao" (grupo_id, nome, valor_minimo, taxa_pix, taxas_cartao, taxas_link, taxas_financiamento, custo, imagem_url, ativo, criado_em)
SELECT '4cd6268b-680b-4861-8649-63c861b03e53', nome, valor_minimo, taxa_pix, taxas_cartao, taxas_link, taxas_financiamento, custo, imagem_url, ativo, criado_em
FROM "precificacao" WHERE grupo_id = '00000000-0000-4000-8000-000000000001';

ALTER TABLE "precificacao" ALTER COLUMN "grupo_id" SET NOT NULL;

-- configuracao_taxas: era um singleton fixo (id sempre 1) — vira uma linha
-- por grupo, com grupo_id como chave primária.
ALTER TABLE "configuracao_taxas" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");

UPDATE "configuracao_taxas" SET "grupo_id" = '00000000-0000-4000-8000-000000000001' WHERE "id" = 1;

ALTER TABLE "configuracao_taxas" DROP CONSTRAINT "configuracao_taxas_pkey";

INSERT INTO "configuracao_taxas" (grupo_id, taxas_cartao, taxas_debito, taxas_link, taxas_financiamento, atualizado_em)
SELECT '227fde12-cce6-46a3-8212-2771be008c2f', taxas_cartao, taxas_debito, taxas_link, taxas_financiamento, atualizado_em
FROM "configuracao_taxas" WHERE grupo_id = '00000000-0000-4000-8000-000000000001';

INSERT INTO "configuracao_taxas" (grupo_id, taxas_cartao, taxas_debito, taxas_link, taxas_financiamento, atualizado_em)
SELECT '4cd6268b-680b-4861-8649-63c861b03e53', taxas_cartao, taxas_debito, taxas_link, taxas_financiamento, atualizado_em
FROM "configuracao_taxas" WHERE grupo_id = '00000000-0000-4000-8000-000000000001';

ALTER TABLE "configuracao_taxas" ALTER COLUMN "grupo_id" SET NOT NULL;
ALTER TABLE "configuracao_taxas" ADD PRIMARY KEY ("grupo_id");
ALTER TABLE "configuracao_taxas" DROP COLUMN "id";

-- grupos: Client ID/Secret do Bling por grupo (BH tem app Bling próprio,
-- diferente do Sul de Minas). Sem backfill aqui — os valores atuais do
-- Sul de Minas são um segredo e são inseridos separadamente via execute_sql,
-- fora de qualquer arquivo versionado.
ALTER TABLE "grupos" ADD COLUMN "bling_client_id" text;
ALTER TABLE "grupos" ADD COLUMN "bling_client_secret" text;

-- bling_config: era um singleton fixo (id sempre 1) — vira uma linha por
-- grupo, com grupo_id como chave primária (mesmo padrão de configuracao_taxas
-- na migração 0020_pix_mcp_grupo/0021_precificacao_grupo).
ALTER TABLE "bling_config" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");

UPDATE "bling_config" SET "grupo_id" = '00000000-0000-4000-8000-000000000001' WHERE "id" = 1;

ALTER TABLE "bling_config" DROP CONSTRAINT "bling_config_pkey";
ALTER TABLE "bling_config" ALTER COLUMN "grupo_id" SET NOT NULL;
ALTER TABLE "bling_config" ADD PRIMARY KEY ("grupo_id");
ALTER TABLE "bling_config" DROP COLUMN "id";

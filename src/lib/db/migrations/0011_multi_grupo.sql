CREATE TABLE "grupos" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome"                text NOT NULL,
  "cnpj"                text NOT NULL,
  "ativo"               boolean DEFAULT true NOT NULL,
  "validapix_email"     text,
  "validapix_password"  text,
  "fabrica_email"       text,
  "fabrica_senha"       text
);

INSERT INTO "grupos" ("id", "nome", "cnpj", "ativo")
VALUES ('00000000-0000-4000-8000-000000000001', 'Sul de Minas', '57.113.017/0001-72', true);

ALTER TABLE "lojas" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "lojas" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "lojas" ALTER COLUMN "grupo_id" SET NOT NULL;

ALTER TABLE "despesas" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "despesas" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "despesas" ALTER COLUMN "grupo_id" SET NOT NULL;

ALTER TABLE "comunicados" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "comunicados" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "comunicados" ALTER COLUMN "grupo_id" SET NOT NULL;

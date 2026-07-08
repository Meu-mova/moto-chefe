ALTER TABLE "pix_recebimentos_mcp" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");

UPDATE "pix_recebimentos_mcp" SET "grupo_id" = '00000000-0000-4000-8000-000000000001' WHERE "grupo_id" IS NULL;

ALTER TABLE "pix_recebimentos_mcp" ALTER COLUMN "grupo_id" SET NOT NULL;

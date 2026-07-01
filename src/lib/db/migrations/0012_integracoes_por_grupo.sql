ALTER TABLE "pix_recebimentos" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "pix_recebimentos" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "pix_recebimentos" ALTER COLUMN "grupo_id" SET NOT NULL;

ALTER TABLE "conciliacoes_cartao" ADD COLUMN "grupo_id" uuid REFERENCES "grupos"("id");
UPDATE "conciliacoes_cartao" SET "grupo_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "conciliacoes_cartao" ALTER COLUMN "grupo_id" SET NOT NULL;

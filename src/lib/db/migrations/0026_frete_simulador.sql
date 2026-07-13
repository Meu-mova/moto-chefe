ALTER TABLE "lojas" ADD COLUMN "cep" text;
ALTER TABLE "lojas" ADD COLUMN "latitude" numeric(9,6);
ALTER TABLE "lojas" ADD COLUMN "longitude" numeric(9,6);

ALTER TABLE "configuracao_taxas" ADD COLUMN "frete_valor_km" numeric(6,2) NOT NULL DEFAULT 3.00;
ALTER TABLE "configuracao_taxas" ADD COLUMN "frete_km_gratis" integer NOT NULL DEFAULT 40;

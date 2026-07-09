-- blingCodigo deixa de ser global (1 por modelo) e passa a ser por
-- modelo + grupo, já que o código do produto no Bling é específico da
-- conta Bling de cada grupo (Sul de Minas e BH têm contas Bling
-- diferentes, com catálogos de produto diferentes).
CREATE TABLE "modelo_bling_codigos" (
  "modelo_id" uuid NOT NULL REFERENCES "modelos"("id"),
  "grupo_id"  uuid NOT NULL REFERENCES "grupos"("id"),
  "codigo"    text NOT NULL,
  PRIMARY KEY ("modelo_id", "grupo_id")
);

-- Backfill: os códigos já cadastrados hoje são os do Sul de Minas.
INSERT INTO "modelo_bling_codigos" (modelo_id, grupo_id, codigo)
SELECT id, '00000000-0000-4000-8000-000000000001', bling_codigo
FROM "modelos"
WHERE bling_codigo IS NOT NULL;

ALTER TABLE "modelos" DROP COLUMN "bling_codigo";

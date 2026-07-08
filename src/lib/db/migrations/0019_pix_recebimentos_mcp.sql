CREATE TYPE "tipo_correspondencia_pix" AS ENUM ('venda', 'os');

CREATE TABLE "pix_recebimentos_mcp" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conta_id"              text NOT NULL,
  "banco"                 text NOT NULL,
  "transacao_id"          text NOT NULL UNIQUE,
  "data"                  timestamp with time zone NOT NULL,
  "valor"                 numeric(12, 2) NOT NULL,
  "pagador_nome"          text,
  "descricao"             text,
  "tipo_correspondencia"  "tipo_correspondencia_pix",
  "venda_id"              uuid REFERENCES "vendas"("id"),
  "os_id"                 uuid REFERENCES "ordens_servico"("id"),
  "lancado_por_id"        uuid REFERENCES "usuarios"("id"),
  "lancado_em"            timestamp with time zone,
  "criado_em"             timestamp with time zone DEFAULT now() NOT NULL
);

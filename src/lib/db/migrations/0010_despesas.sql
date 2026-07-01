CREATE TABLE "despesas" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "loja_id"         uuid REFERENCES "lojas"("id"),
  "usuario_id"      uuid NOT NULL REFERENCES "usuarios"("id"),
  "categoria"       text NOT NULL,
  "descricao"       text,
  "valor"           numeric(12, 2) NOT NULL,
  "data"            date NOT NULL,
  "forma_pagamento" text NOT NULL,
  "banco"           text NOT NULL,
  "criado_em"       timestamp with time zone DEFAULT now() NOT NULL
);

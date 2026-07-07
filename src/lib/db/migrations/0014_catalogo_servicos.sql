CREATE TABLE "servicos_catalogo" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome"                    text NOT NULL,
  "tempo_previsto_minutos"  integer,
  "valor"                   numeric(10, 2) DEFAULT '0' NOT NULL,
  "ativo"                   boolean DEFAULT true NOT NULL,
  "criado_em"               timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em"           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "os_itens" ADD COLUMN "servico_id" uuid REFERENCES "servicos_catalogo"("id");

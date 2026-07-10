ALTER TYPE "disponibilidade_moto" ADD VALUE 'aguardando_aprovacao';
ALTER TYPE "referencia_tipo" ADD VALUE 'aprovacao_venda';

CREATE TYPE "aprovacao_venda_status" AS ENUM ('pendente', 'aprovada', 'recusada');

CREATE TABLE "aprovacoes_venda" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "moto_id" uuid NOT NULL REFERENCES "motos"("id"),
  "loja_id" uuid NOT NULL REFERENCES "lojas"("id"),
  "vendedor_id" uuid NOT NULL REFERENCES "usuarios"("id"),
  "valor" numeric(12,2) NOT NULL,
  "dados_venda" jsonb NOT NULL,
  "motivo" text NOT NULL,
  "disponibilidade_anterior" "disponibilidade_moto",
  "status" "aprovacao_venda_status" NOT NULL DEFAULT 'pendente',
  "respondido_por" uuid REFERENCES "usuarios"("id"),
  "data_solicitacao" timestamp with time zone DEFAULT now() NOT NULL,
  "data_resposta" timestamp with time zone
);

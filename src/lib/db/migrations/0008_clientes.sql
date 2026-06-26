CREATE TYPE "tipo_pessoa" AS ENUM ('fisica', 'juridica');
CREATE TYPE "sexo" AS ENUM ('masculino', 'feminino', 'nao_identificado');

CREATE TABLE "clientes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "tipo_pessoa" "tipo_pessoa" NOT NULL DEFAULT 'fisica',
  "cpf_cnpj" text UNIQUE,
  "sexo" "sexo" NOT NULL DEFAULT 'nao_identificado',
  "email" text,
  "celular" text,
  "endereco" text,
  "numero" text,
  "complemento" text,
  "bairro" text,
  "cep" text,
  "cidade" text,
  "uf" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "vendas" ADD COLUMN "cliente_id" uuid REFERENCES "clientes"("id");
ALTER TABLE "ordens_servico" ADD COLUMN "cliente_id" uuid REFERENCES "clientes"("id");

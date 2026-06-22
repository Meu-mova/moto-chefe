CREATE TYPE "public"."disponibilidade_moto" AS ENUM('disponivel', 'reservada', 'vendida');--> statement-breakpoint
CREATE TYPE "public"."reserva_status" AS ENUM('ativa', 'convertida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_lancamento" AS ENUM('entrada', 'saida');--> statement-breakpoint
ALTER TYPE "public"."categoria" ADD VALUE 'triciclo';--> statement-breakpoint
ALTER TYPE "public"."categoria" ADD VALUE 'bike';--> statement-breakpoint
ALTER TYPE "public"."categoria" ADD VALUE 'brinquedo';--> statement-breakpoint
ALTER TYPE "public"."categoria" ADD VALUE 'patinete';--> statement-breakpoint
ALTER TYPE "public"."moto_status" ADD VALUE 'caixa';--> statement-breakpoint
ALTER TYPE "public"."papel" ADD VALUE 'admin_socio' BEFORE 'aux_adm';--> statement-breakpoint
CREATE TABLE "lancamentos_caixa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loja_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "tipo_lancamento" NOT NULL,
	"categoria" text NOT NULL,
	"descricao" text,
	"valor" numeric(12, 2) NOT NULL,
	"data" date NOT NULL,
	"venda_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moto_id" uuid NOT NULL,
	"loja_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"valor_reserva" numeric(12, 2) NOT NULL,
	"valor_total_venda" numeric(12, 2),
	"meio_pagamento" text NOT NULL,
	"data_prevista_finalizacao" date NOT NULL,
	"status" "reserva_status" DEFAULT 'ativa' NOT NULL,
	"cliente_nome" text,
	"cliente_cpf" text,
	"cliente_celular" text,
	"cliente_email" text,
	"cliente_cep" text,
	"cliente_logradouro" text,
	"cliente_numero" text,
	"cliente_complemento" text,
	"cliente_bairro" text,
	"cliente_cidade" text,
	"cliente_estado" text,
	"cartao_operadora" text,
	"cartao_parcelas" numeric,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "motos" ALTER COLUMN "status" SET DEFAULT 'caixa';--> statement-breakpoint
ALTER TABLE "garantias" ADD COLUMN "data_encerramento" date;--> statement-breakpoint
ALTER TABLE "motos" ADD COLUMN "disponibilidade" "disponibilidade_moto";--> statement-breakpoint
ALTER TABLE "motos" ADD COLUMN "motor" text;--> statement-breakpoint
ALTER TABLE "motos" ADD COLUMN "preco_compra" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_celular" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_email" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_cep" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_logradouro" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_numero" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_complemento" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_bairro" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_cidade" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_estado" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "pagamentos" jsonb;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "reserva_id" uuid;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "nota_fiscal_saida" text;--> statement-breakpoint
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_venda_id_vendas_id_fk" FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_moto_id_motos_id_fk" FOREIGN KEY ("moto_id") REFERENCES "public"."motos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE no action ON UPDATE no action;
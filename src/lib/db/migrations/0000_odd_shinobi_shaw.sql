CREATE TYPE "public"."categoria" AS ENUM('autopropelido', 'ciclomotor');--> statement-breakpoint
CREATE TYPE "public"."garantia_status" AS ENUM('ativa', 'encerrada');--> statement-breakpoint
CREATE TYPE "public"."historico_tipo" AS ENUM('entrada', 'saida', 'transferencia_enviada', 'transferencia_recebida', 'mudanca_status');--> statement-breakpoint
CREATE TYPE "public"."moto_status" AS ENUM('faturada', 'montada', 'disponivel', 'reservada', 'em_garantia', 'vendida');--> statement-breakpoint
CREATE TYPE "public"."os_status" AS ENUM('aberta', 'em_andamento', 'concluida');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('admin_geral', 'aux_adm', 'vendedor', 'mecanico');--> statement-breakpoint
CREATE TYPE "public"."pedido_status" AS ENUM('pendente', 'efetivado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."referencia_tipo" AS ENUM('transferencia', 'pedido_venda');--> statement-breakpoint
CREATE TYPE "public"."transferencia_status" AS ENUM('pendente', 'aceita', 'recusada');--> statement-breakpoint
CREATE TABLE "garantias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moto_id" uuid NOT NULL,
	"loja_id" uuid NOT NULL,
	"os_id" uuid,
	"descricao" text NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"status" "garantia_status" DEFAULT 'ativa' NOT NULL,
	"data_pedido_peca" date,
	"numero_pedido_fabrica" text
);
--> statement-breakpoint
CREATE TABLE "historico_estoque" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moto_id" uuid NOT NULL,
	"loja_origem_id" uuid,
	"loja_destino_id" uuid,
	"usuario_id" uuid NOT NULL,
	"tipo" "historico_tipo" NOT NULL,
	"status_anterior" "moto_status",
	"status_novo" "moto_status",
	"referencia_tipo" "referencia_tipo",
	"referencia_id" uuid,
	"data" timestamp with time zone DEFAULT now() NOT NULL,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "lojas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"cidade" text NOT NULL,
	"endereco" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modelos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marca" text NOT NULL,
	"modelo" text NOT NULL,
	"categoria" "categoria" NOT NULL,
	"potencia_w" text NOT NULL,
	"motor" text NOT NULL,
	"velocidade_max" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chassi" text NOT NULL,
	"modelo_id" uuid NOT NULL,
	"loja_id" uuid NOT NULL,
	"status" "moto_status" DEFAULT 'faturada' NOT NULL,
	"cor" text NOT NULL,
	"nota_fiscal_entrada" text NOT NULL,
	"responsavel_montagem_id" uuid,
	"data_montagem" date,
	CONSTRAINT "motos_chassi_unique" UNIQUE("chassi")
);
--> statement-breakpoint
CREATE TABLE "ordens_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moto_id" uuid NOT NULL,
	"loja_id" uuid NOT NULL,
	"aberta_por" uuid NOT NULL,
	"mecanico_id" uuid,
	"status" "os_status" DEFAULT 'aberta' NOT NULL,
	"descricao" text NOT NULL,
	"data_abertura" timestamp with time zone DEFAULT now() NOT NULL,
	"data_conclusao" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pedidos_venda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moto_id" uuid NOT NULL,
	"loja_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"status" "pedido_status" DEFAULT 'pendente' NOT NULL,
	"data_pedido" timestamp with time zone DEFAULT now() NOT NULL,
	"data_atualizacao" timestamp with time zone DEFAULT now() NOT NULL,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "transferencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moto_id" uuid NOT NULL,
	"loja_origem_id" uuid NOT NULL,
	"loja_destino_id" uuid NOT NULL,
	"solicitado_por" uuid NOT NULL,
	"respondido_por" uuid,
	"status" "transferencia_status" DEFAULT 'pendente' NOT NULL,
	"data_solicitacao" timestamp with time zone DEFAULT now() NOT NULL,
	"data_resposta" timestamp with time zone,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"papel" "papel" NOT NULL,
	"loja_id" uuid,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_venda_id" uuid NOT NULL,
	"moto_id" uuid NOT NULL,
	"loja_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"efetivado_por" uuid NOT NULL,
	"cliente_nome" text NOT NULL,
	"cliente_cpf" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"forma_pagamento" text NOT NULL,
	"data_venda" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_moto_id_motos_id_fk" FOREIGN KEY ("moto_id") REFERENCES "public"."motos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_estoque" ADD CONSTRAINT "historico_estoque_moto_id_motos_id_fk" FOREIGN KEY ("moto_id") REFERENCES "public"."motos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_estoque" ADD CONSTRAINT "historico_estoque_loja_origem_id_lojas_id_fk" FOREIGN KEY ("loja_origem_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_estoque" ADD CONSTRAINT "historico_estoque_loja_destino_id_lojas_id_fk" FOREIGN KEY ("loja_destino_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_estoque" ADD CONSTRAINT "historico_estoque_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motos" ADD CONSTRAINT "motos_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motos" ADD CONSTRAINT "motos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motos" ADD CONSTRAINT "motos_responsavel_montagem_id_usuarios_id_fk" FOREIGN KEY ("responsavel_montagem_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_moto_id_motos_id_fk" FOREIGN KEY ("moto_id") REFERENCES "public"."motos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_aberta_por_usuarios_id_fk" FOREIGN KEY ("aberta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_mecanico_id_usuarios_id_fk" FOREIGN KEY ("mecanico_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_moto_id_motos_id_fk" FOREIGN KEY ("moto_id") REFERENCES "public"."motos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_moto_id_motos_id_fk" FOREIGN KEY ("moto_id") REFERENCES "public"."motos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_loja_origem_id_lojas_id_fk" FOREIGN KEY ("loja_origem_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_loja_destino_id_lojas_id_fk" FOREIGN KEY ("loja_destino_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_solicitado_por_usuarios_id_fk" FOREIGN KEY ("solicitado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_respondido_por_usuarios_id_fk" FOREIGN KEY ("respondido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_pedido_venda_id_pedidos_venda_id_fk" FOREIGN KEY ("pedido_venda_id") REFERENCES "public"."pedidos_venda"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_moto_id_motos_id_fk" FOREIGN KEY ("moto_id") REFERENCES "public"."motos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_efetivado_por_usuarios_id_fk" FOREIGN KEY ("efetivado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
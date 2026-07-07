CREATE TYPE "public"."sexo" AS ENUM('masculino', 'feminino', 'nao_identificado');--> statement-breakpoint
CREATE TYPE "public"."tipo_pessoa" AS ENUM('fisica', 'juridica');--> statement-breakpoint
CREATE TABLE "agendamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loja_id" uuid NOT NULL,
	"mecanico_id" uuid,
	"cliente_id" uuid,
	"cliente_nome" text NOT NULL,
	"cliente_fone" text NOT NULL,
	"tipo_servico" text NOT NULL,
	"descricao_cliente" text,
	"data_hora_inicio" timestamp with time zone NOT NULL,
	"duracao_minutos" integer DEFAULT 60 NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"os_id" uuid,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bling_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias_caixa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias_despesa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo_pessoa" "tipo_pessoa" DEFAULT 'fisica' NOT NULL,
	"cpf_cnpj" text,
	"sexo" "sexo" DEFAULT 'nao_identificado' NOT NULL,
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
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_cpf_cnpj_unique" UNIQUE("cpf_cnpj")
);
--> statement-breakpoint
CREATE TABLE "comunicados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"conteudo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"papeis" text[] DEFAULT '{}' NOT NULL,
	"data_postagem" timestamp with time zone,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comunicados_lidos" (
	"comunicado_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"lido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comunicados_lidos_comunicado_id_usuario_id_pk" PRIMARY KEY("comunicado_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "conciliacoes_cartao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"operadora" text NOT NULL,
	"data_transacao" date NOT NULL,
	"nsu" text,
	"autorizacao" text,
	"valor_bruto" numeric(12, 2) NOT NULL,
	"valor_liquido" numeric(12, 2),
	"parcelas" integer DEFAULT 1 NOT NULL,
	"tipo" text DEFAULT 'credito' NOT NULL,
	"status" text DEFAULT 'aprovado' NOT NULL,
	"venda_id" uuid,
	"conciliado" boolean DEFAULT false NOT NULL,
	"conciliado_em" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracao_taxas" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"taxas_cartao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"taxas_debito" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"taxas_link" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"taxas_financiamento" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demandas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modelo" text NOT NULL,
	"cor" text NOT NULL,
	"loja_id" uuid NOT NULL,
	"solicitante_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "despesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"loja_id" uuid,
	"usuario_id" uuid NOT NULL,
	"categoria" text NOT NULL,
	"descricao" text,
	"valor" numeric(12, 2) NOT NULL,
	"data" date NOT NULL,
	"forma_pagamento" text NOT NULL,
	"banco" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grupos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"validapix_email" text,
	"validapix_password" text,
	"fabrica_email" text,
	"fabrica_senha" text
);
--> statement-breakpoint
CREATE TABLE "os_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"os_id" uuid NOT NULL,
	"servico_id" uuid,
	"tipo" text DEFAULT 'servico' NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" numeric(10, 3) DEFAULT '1' NOT NULL,
	"valor_unitario" numeric(10, 2) DEFAULT '0' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pix_recebimentos" (
	"id" text PRIMARY KEY NOT NULL,
	"grupo_id" uuid NOT NULL,
	"data_pagamento" timestamp with time zone NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"pagador_nome" text,
	"pagador_documento" text,
	"observacao" text,
	"venda_id" uuid,
	"pedido_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"valor_minimo" numeric(12, 2) NOT NULL,
	"taxa_pix" numeric(8, 6) DEFAULT '0' NOT NULL,
	"taxas_cartao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"taxas_link" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"taxas_financiamento" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custo" numeric(12, 2),
	"imagem_url" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicos_catalogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tempo_previsto_minutos" integer,
	"valor" numeric(10, 2) DEFAULT '0' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulador_precos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"preco_avista" numeric(10, 2) NOT NULL,
	"preco_pix" numeric(10, 2) NOT NULL,
	"taxa_cartao_fisico" numeric(8, 6) NOT NULL,
	"taxa_link_pagamento" numeric(8, 6) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veiculos_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chassi" text NOT NULL,
	"numero_motor" text,
	"marca" text DEFAULT '' NOT NULL,
	"modelo" text DEFAULT '' NOT NULL,
	"cor" text,
	"ano" integer,
	"nf_entrada" text,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "veiculos_historico_chassi_unique" UNIQUE("chassi")
);
--> statement-breakpoint
ALTER TABLE "ordens_servico" ALTER COLUMN "moto_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "garantias" ADD COLUMN "status_fabrica" text;--> statement-breakpoint
ALTER TABLE "garantias" ADD COLUMN "status_fabrica_sync_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lancamentos_caixa" ADD COLUMN "status_aprovacao" text DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "lancamentos_caixa" ADD COLUMN "aprovado_por_id" uuid;--> statement-breakpoint
ALTER TABLE "lancamentos_caixa" ADD COLUMN "aprovado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lojas" ADD COLUMN "grupo_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "imagem_url" text;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "bling_codigo" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "numero" integer;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "tipo_os" text DEFAULT 'interna' NOT NULL;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "diagnostico" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "observacoes_finais" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "valor_total" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "forma_pagamento" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "data_previsao" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "marca_externa" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "modelo_externo" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "placa" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "km" integer;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "cliente_nome_externo" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "cliente_fone_externo" text;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "agendamento_id" uuid;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "origem" text DEFAULT 'walk_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD COLUMN "chassi_os" text;--> statement-breakpoint
ALTER TABLE "pedidos_venda" ADD COLUMN "numero" integer DEFAULT nextval('numero_venda_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "numero" integer DEFAULT nextval('numero_venda_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "numero" integer DEFAULT nextval('numero_venda_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "bling_nfe_id" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "status_conciliacao" text DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_mecanico_id_usuarios_id_fk" FOREIGN KEY ("mecanico_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados_lidos" ADD CONSTRAINT "comunicados_lidos_comunicado_id_comunicados_id_fk" FOREIGN KEY ("comunicado_id") REFERENCES "public"."comunicados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados_lidos" ADD CONSTRAINT "comunicados_lidos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_cartao" ADD CONSTRAINT "conciliacoes_cartao_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes_cartao" ADD CONSTRAINT "conciliacoes_cartao_venda_id_vendas_id_fk" FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_solicitante_id_usuarios_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_os_id_ordens_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordens_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_servico_id_servicos_catalogo_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servicos_catalogo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pix_recebimentos" ADD CONSTRAINT "pix_recebimentos_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pix_recebimentos" ADD CONSTRAINT "pix_recebimentos_venda_id_vendas_id_fk" FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pix_recebimentos" ADD CONSTRAINT "pix_recebimentos_pedido_id_pedidos_venda_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_venda"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_aprovado_por_id_usuarios_id_fk" FOREIGN KEY ("aprovado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;
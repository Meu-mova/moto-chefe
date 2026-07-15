CREATE TYPE "aprovacao_venda_tipo" AS ENUM ('valor_minimo', 'pagamento_sensivel');
ALTER TABLE "aprovacoes_venda" ADD COLUMN "tipo" "aprovacao_venda_tipo" NOT NULL DEFAULT 'valor_minimo';

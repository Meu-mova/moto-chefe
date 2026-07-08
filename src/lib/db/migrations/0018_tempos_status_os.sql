ALTER TABLE "ordens_servico" ADD COLUMN "oficina_em" timestamp with time zone;
ALTER TABLE "ordens_servico" ADD COLUMN "em_andamento_em" timestamp with time zone;
ALTER TABLE "ordens_servico" ADD COLUMN "finalizada_em" timestamp with time zone;
ALTER TABLE "ordens_servico" ADD COLUMN "pendente_pagamento_em" timestamp with time zone;

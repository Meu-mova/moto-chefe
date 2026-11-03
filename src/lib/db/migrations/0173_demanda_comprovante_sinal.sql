-- Comprovante do valor do sinal da demanda (prioridade). Obrigatório a partir daqui para
-- quem registra o sinal; o arquivo fica no bucket privado 'comprovantes', em
-- demandas/<grupoId>/, e o cron /api/cron/comprovantes-demanda o apaga depois de 90 dias.
-- Demanda com sinal anterior a esta migração fica sem comprovante (nulo).
-- Número 0173: a 0172 está na branch feat/arquivar-moto (moto arquivada).
alter table demandas add column if not exists comprovante_sinal_path text;
alter table demandas add column if not exists comprovante_sinal_em timestamptz;

-- Caminho e data andam juntos.
alter table demandas add constraint demandas_comprovante_sinal_completo check (
  (comprovante_sinal_path is null) = (comprovante_sinal_em is null)
);

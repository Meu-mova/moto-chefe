-- Chassi único por Conta no histórico de veículos (#325). Único na base toda, a Conta B
-- não cadastrava o próprio veículo se a A já tivesse o chassi, e o "já existe" revelava
-- o dado da A. Sem "if exists": nome errado tem de falhar, não passar calado.
drop index idx_veiculos_historico_chassi;
drop index veiculos_historico_conta_id_idx;
create unique index veiculos_historico_conta_chassi_key on veiculos_historico (conta_id, chassi);

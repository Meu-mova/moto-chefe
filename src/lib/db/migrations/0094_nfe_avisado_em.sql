-- src/lib/db/migrations/0094_nfe_avisado_em.sql
-- Memória do aviso de WhatsApp por nota — igual ao padrão de
-- pedidos_fabrica_alerta.avisado_em.
--
-- Sem esta coluna, "já avisei essa nota?" dependeria do estado momentâneo da
-- fila do cron (proxima_consulta_em), e isso já causou um bug: durante o
-- backlog a nota é gravada e vira "conhecida" na mesma rodada, então nunca
-- mais aparece em "novas" — se o aviso só disparasse quando a fila zerasse,
-- as notas das rodadas anteriores ao fim do backlog nunca seriam avisadas,
-- para sempre. Marcando no banco o que já foi avisado (e só depois que o
-- WhatsApp confirmou o envio), a nota gravada durante o backlog fica pendente
-- de aviso e é pega assim que a fila zera — não se perde entre rodadas.

ALTER TABLE nfe_recebidas ADD COLUMN IF NOT EXISTS avisado_em timestamptz;

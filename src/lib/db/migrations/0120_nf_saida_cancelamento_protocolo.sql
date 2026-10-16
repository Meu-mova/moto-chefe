-- Protocolo do cancelamento extemporâneo, pedido pelo contador fora do prazo de 24h (#172).
alter table notas_fiscais_saida add column cancelamento_protocolo text;

-- Contador que pediu à SEFAZ a liberação do cancelamento extemporâneo (#176).
alter table notas_fiscais_saida add column cancelamento_contador text;

-- A v1.4.0 marcava a nota como Cancelada só no MOVA, sem pedir nada à Nota Gateway:
-- na SEFAZ ela segue autorizada. Volta a Autorizada e refatura a venda, se a venda
-- ainda não tem outra NF (em produção, só a NF 1015 da venda 31716).
with voltou as (
  update notas_fiscais_saida set status = 'Autorizada', atualizado_em = now()
  where cancelamento_protocolo is not null and status = 'Cancelada' and ambiente = 'Producao'
  returning venda_id, numero
), refaturada as (
  update vendas v set nota_fiscal_saida = voltou.numero
  from voltou
  where v.id = voltou.venda_id and v.nota_fiscal_saida is null
  returning v.moto_id
)
update motos m set disponibilidade = 'vendida'
from refaturada
where m.id = refaturada.moto_id and m.disponibilidade is null;

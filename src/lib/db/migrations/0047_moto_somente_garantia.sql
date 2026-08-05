-- Moto cadastrada só para registrar garantia de veículo externo (chassi fora da
-- base) nunca é estoque. Flag para excluí-la do Showroom. Corrige o caso do
-- chassi HL5TCAH33S9W67087, que foi parar no estoque da Varginha.
alter table motos add column somente_garantia boolean not null default false;

update motos set somente_garantia = true
where exists (
  select 1 from historico_estoque h
  where h.moto_id = motos.id and h.observacao = 'Cadastro via abertura de garantia'
);

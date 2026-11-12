-- Entrega da venda (#682, Refs #725): onde a moto chega ao cliente (retira na loja ou
-- entregar num endereço) e a modalidade do frete na nota. Nasce no pedido e vai para a
-- venda na efetivação, como o snapshot do cliente; a NF de saída decide dentro ou fora
-- do estado por ela, não pela UF do cliente.
-- jsonb e não colunas: o conteúdo (modo, modalidade, endereço de entrega, quem recebe,
-- frete) é um tipo só em src/lib e cresce nos próximos tickets sem outra migração.
-- Nenhuma tabela guarda isso hoje: o transporte só vive no payload de
-- notas_fiscais_saida, que é da tentativa de nota, não da venda.
-- Nulo = pedido/venda anterior à Entrega: a NF segue a regra antiga. Sem backfill.
alter table pedidos_venda add column if not exists entrega jsonb;
alter table vendas add column if not exists entrega jsonb;

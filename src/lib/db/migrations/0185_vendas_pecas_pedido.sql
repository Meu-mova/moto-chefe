-- Brinde e acessório do pedido de venda (#778). Na efetivação, eles viram uma venda de peça ligada ao
-- pedido: a baixa de estoque, a tela Peças e a base de peças da folha já leem vendas_pecas. A ligação
-- serve ao cancelar o pedido efetivado, que precisa achar essa venda para devolver o estoque.
-- Nula: as vendas de peça do balcão não têm pedido.
ALTER TABLE vendas_pecas ADD COLUMN pedido_venda_id uuid REFERENCES pedidos_venda(id);
CREATE INDEX vendas_pecas_pedido_venda_idx ON vendas_pecas (pedido_venda_id) WHERE pedido_venda_id IS NOT NULL;

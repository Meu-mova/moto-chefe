-- Garantia passa a saber em qual conta do portal da fábrica o pedido dela vive.
--
-- O portal trocou o login por bandeira por um login por loja (05/08/2026), mas o
-- histórico não foi dividido: apurado em 08/08/2026, a conta antiga
-- (ecomovminasgerais@gmail.com, hoje a de Pouso Alegre) é a única que enxerga os
-- pedidos de garantia de Varginha e Itajuba abertos antes da separação — as contas
-- novas não veem nem os da própria loja. Sem esta coluna, o Sincronizar escopa
-- pela loja da MOTO e reporta erro em toda garantia antiga.
--
-- NULL = a conta da própria loja da garantia (o caso normal, daqui pra frente).

ALTER TABLE garantias
  ADD COLUMN IF NOT EXISTS fabrica_conta_loja_id uuid REFERENCES lojas(id);

COMMENT ON COLUMN garantias.fabrica_conta_loja_id IS
  'Loja cuja conta no portal da fabrica enxerga este pedido. NULL = a conta da propria loja da garantia.';

-- Backfill: todo pedido do Sul de Minas aberto antes de agosto/2026 vive na conta
-- velha. Vale também para Galpão Matriz e Lavras, que não têm conta no portal e
-- por isso nunca sincronizavam.
-- Agosto fica de fora de propósito: os pedidos de Varginha (38440, 38493, 38571)
-- já não estão na conta velha, e os de Pouso Alegre são dela mesma.
UPDATE garantias g
SET fabrica_conta_loja_id = (
  SELECT id FROM lojas
  WHERE nome = 'Pouso Alegre'
    AND grupo_id = (SELECT id FROM grupos WHERE nome = 'Sul de Minas')
)
WHERE g.numero_pedido_fabrica IS NOT NULL
  AND g.data_inicio < DATE '2026-08-01'
  AND g.loja_id IN (
    SELECT id FROM lojas
    WHERE grupo_id = (SELECT id FROM grupos WHERE nome = 'Sul de Minas')
  );

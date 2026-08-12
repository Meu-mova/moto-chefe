-- Remove a duplicata de "Estorno ao CLIENTE" criada pela 0058 na versão anterior
-- (o ON CONFLICT não tinha índice único para acionar) e marca todas as grafias.

DELETE FROM categorias_despesa a
USING categorias_despesa b
WHERE lower(trim(a.nome)) = 'estorno ao cliente'
  AND lower(trim(b.nome)) = 'estorno ao cliente'
  AND a.nome = b.nome
  AND a.criado_em > b.criado_em;

UPDATE categorias_despesa
SET conta_como_despesa = false, motivo_nao_operacional = 'estorno_cliente'
WHERE lower(trim(nome)) = 'estorno ao cliente';

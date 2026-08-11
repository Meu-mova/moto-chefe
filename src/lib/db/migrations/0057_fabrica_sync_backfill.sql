-- Estado inicial da leitura: loja sem login da fábrica cadastrado já é uma
-- lacuna conhecida, não precisa esperar o cron para o card avisar.
INSERT INTO fabrica_sync_loja (loja_id, status, pedidos, executado_em)
SELECT l.id, 'sem_credencial', 0, now()
FROM lojas l
WHERE l.ativa
  AND (l.fabrica_email IS NULL OR l.fabrica_senha IS NULL)
ON CONFLICT (loja_id) DO NOTHING;

-- Separa "pedido conhecido" de "pedido já avisado no WhatsApp".
--
-- Até aqui a linha em pedidos_fabrica_alerta só era gravada DEPOIS do envio
-- confirmado, e a própria existência da linha significava "já avisei". Isso
-- amarra o dado ao aviso: com o WhatsApp fora do ar, o pedido existe na fábrica
-- e não existe no banco — e o card do dashboard mostraria zero.
--
-- Agora a linha é gravada sempre que o pedido é visto, e avisado_em registra
-- quando (e se) o aviso saiu. "Novo" passa a ser avisado_em IS NULL.

ALTER TABLE pedidos_fabrica_alerta
  ADD COLUMN IF NOT EXISTS avisado_em timestamptz;

-- Linhas existentes só chegaram ao banco após um envio confirmado.
UPDATE pedidos_fabrica_alerta
SET avisado_em = ultimo_alerta_em
WHERE avisado_em IS NULL;

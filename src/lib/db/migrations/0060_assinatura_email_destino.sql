-- Código de assinatura passa a ser enviado por E-MAIL (antes: WhatsApp).
-- O e-mail de destino fica no próprio documento, preenchido do cadastro da venda.
ALTER TABLE documentos_assinatura ADD COLUMN IF NOT EXISTS email_destino text;

-- Backfill dos documentos existentes a partir do e-mail do cliente na venda,
-- para que documentos ainda vivos consigam enviar o código sem recriar.
UPDATE documentos_assinatura d
SET email_destino = v.cliente_email
FROM vendas v
WHERE d.venda_id = v.id
  AND d.email_destino IS NULL
  AND v.cliente_email IS NOT NULL
  AND v.cliente_email <> '';

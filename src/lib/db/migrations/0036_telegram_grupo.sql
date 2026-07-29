-- Chat do Telegram por grupo (Sul de Minas / BH têm grupos de aviso distintos).
-- Fica junto das outras credenciais por grupo (validapix_*, fabrica_*, bling_*).
-- Nulo = grupo não recebe aviso.
ALTER TABLE grupos ADD COLUMN IF NOT EXISTS telegram_chat_id text;

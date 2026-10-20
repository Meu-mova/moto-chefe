-- E-mail do dia do vencimento já enviado (#209): o cron não repete.
ALTER TABLE mensalidades ADD COLUMN IF NOT EXISTS aviso_vencimento_em timestamptz;

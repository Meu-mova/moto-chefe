-- Fim do ValidaPix (15/09/2026).
--
-- O PIX recebido passou a vir inteiro do Open Finance (pix_recebimentos_mcp,
-- via mcp.ai) em julho/2026; a integração antiga ficou parada desde 14/07 e
-- agora sai do sistema junto com a tela /pix e a lib.
--
-- RODAR SÓ DEPOIS DO DEPLOY do código que não lê mais estas colunas: o Drizzle
-- lista as colunas explicitamente no SELECT, então derrubar `validapix_email`
-- com a versão antiga no ar quebraria toda tela que lê `grupos`.
--
-- As 300 linhas de pix_recebimentos (143 amarradas a uma venda, todas
-- anteriores a 15/07/2026) foram exportadas antes do drop para
-- backups/pix_recebimentos_validapix_20260915.json — fora do git, porque
-- trazem nome e documento de pagador.
DROP TABLE IF EXISTS pix_recebimentos;

ALTER TABLE grupos DROP COLUMN IF EXISTS validapix_email;
ALTER TABLE grupos DROP COLUMN IF EXISTS validapix_password;

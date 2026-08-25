-- "Dinheiro p/Cx de loja" não é despesa.
--
-- A categoria marca a saída do banco que abastece a gaveta da loja. O dinheiro
-- não saiu da empresa: mudou de bolso. Contá-la como despesa operacional cobra
-- duas vezes — uma quando o dinheiro sai do banco e outra quando o administrativo
-- gasta a mesma nota e lança em /caixa. É a mesma razão pela qual "Depósito", que
-- é o caminho de volta (gaveta → banco), já estava fora do cálculo.
--
-- Confirmado pelo Cesar em 24/08/2026, na revisão do agrupamento do DRE.
--
-- O motivo é transferencia_interna: dinheiro que mudou de bolso dentro da própria
-- empresa. O rótulo do motivo foi ampliado junto ("Transferência interna"), que
-- antes falava só de PIX entre os CNPJs do grupo.
--
-- grupo_dre volta a NULL porque não operacional não entra no corpo do DRE — sai
-- no memorando, classificada pelo motivo.
UPDATE categorias_despesa
   SET conta_como_despesa    = false,
       motivo_nao_operacional = 'transferencia_interna',
       grupo_dre              = NULL
 WHERE nome = 'Dinheiro p/Cx de loja';

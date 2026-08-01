-- PIX entre os CNPJs do próprio grupo (BH → Sul de Minas e vice-versa) sai do caixa de
-- uma empresa e entra no da outra. Contando dos dois lados, o grupo aparece "gastando"
-- um dinheiro que nunca saiu do grupo — R$ 33.093 só em julho/2026.
--
-- Vai por CNPJ e não por categoria porque as cinco transferências de abril a junho
-- (R$ 61.600) nunca foram categorizadas, e a regra por categoria não alcança essas.
-- Cada grupo recebe o CNPJ de TODOS os grupos, inclusive o próprio: existe PIX de
-- mesma titularidade no extrato do Sul de Minas ("TRANSF.REALIZADA PIX SICOOB-MESMA
-- TIT. - FAV.: ECOMOV MOBILIDADE LTDA").
INSERT INTO favorecidos_nao_operacionais (grupo_id, cnpj, rotulo, motivo)
SELECT g.id,
       regexp_replace(alvo.cnpj, '\D', '', 'g'),
       'Grupo ' || alvo.nome,
       'transferencia_interna'
FROM grupos g
CROSS JOIN grupos alvo
ON CONFLICT (grupo_id, cnpj) DO NOTHING;

-- Reforço pelo lado da categoria: uma transferência futura pra um CNPJ que ainda não
-- esteja na lista continua saindo do cálculo se alguém a classificar assim.
UPDATE categorias_despesa SET conta_como_despesa = false
WHERE nome = 'Transferencia entre Lojas';

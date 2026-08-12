-- "Estorno ao CLIENTE" sai do custo operacional.
--
-- É saída real de dinheiro, mas não é custo de operar a loja: a entrada
-- correspondente já foi contada como receita, e o estorno apenas a desfaz.
-- Contando dos dois lados, a loja "gasta" um dinheiro que nunca foi dela.
--
-- O catálogo tinha DUAS grafias ("Estorno ao Cliente" e "Estorno ao CLIENTE") e
-- os lançamentos usam a segunda. Como o cálculo casava categoria por string
-- exata, a marcação na primeira nunca surtia efeito. Aqui todas as grafias são
-- marcadas; o casamento passou a ignorar caixa (ver despesas-operacionais.ts).

UPDATE categorias_despesa
SET conta_como_despesa = false, motivo_nao_operacional = 'estorno_cliente'
WHERE lower(trim(nome)) = 'estorno ao cliente';

-- Só cria se nenhuma grafia existir.
INSERT INTO categorias_despesa (nome, ativo, conta_como_despesa, motivo_nao_operacional, ordem)
SELECT 'Estorno ao CLIENTE', true, false, 'estorno_cliente', 90
WHERE NOT EXISTS (
  SELECT 1 FROM categorias_despesa WHERE lower(trim(nome)) = 'estorno ao cliente'
);

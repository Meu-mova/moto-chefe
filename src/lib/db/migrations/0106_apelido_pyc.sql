-- PYC e como a LAIOUNS chama o DRIFT CAR no codigo do item (MT-PYC, descrito
-- como "TRICICLO ELETRICO PYC-001"), enquanto o infCpl da mesma nota escreve
-- "DRIFT". Confirmado pela aritmetica da NF 38576: os 9 itens tem quantidade
-- 3/3/4/2/2/3/4/1/3 e o infCpl tem exatamente a mesma contagem por modelo --
-- todos casam menos MT-PYC=4 e DRIFT=4, que sobram um para o outro. O Cesar
-- confirmou em 24/09/2026.
INSERT INTO modelo_apelidos (apelido, modelo_id)
SELECT 'PYC', id FROM modelos WHERE modelo = 'DRIFT CAR'
ON CONFLICT (apelido) DO NOTHING;

INSERT INTO modelo_apelidos (apelido, modelo_id)
SELECT 'PYC 001', id FROM modelos WHERE modelo = 'DRIFT CAR'
ON CONFLICT (apelido) DO NOTHING;

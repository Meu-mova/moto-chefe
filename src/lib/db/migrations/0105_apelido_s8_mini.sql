-- S8-MINI e como a nota da Q.p.a (NF 276) chama o MC20 MINI no infCpl.
-- Confirmado pelo Cesar em 24/09/2026. Sem o de-para, os 4 chassis dessa nota
-- nao encontram o item "MT-MC20 MINI" e ficam sem ficha fiscal.
--
-- Guardado normalizado (caixa alta, hifen vira espaco), como faz
-- normalizarModelo -- e como a action da tela grava.
INSERT INTO modelo_apelidos (apelido, modelo_id)
SELECT 'S8 MINI', id FROM modelos WHERE modelo = 'MC20 MINI'
ON CONFLICT (apelido) DO NOTHING;

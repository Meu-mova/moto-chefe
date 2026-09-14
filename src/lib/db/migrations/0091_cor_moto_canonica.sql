-- Uma grafia por cor.
--
-- Quatro motos entraram com a cor no feminino: 1 JETMAX "PRETA" entre 451
-- "PRETO" e 3 FANTOM "BRANCA" entre 283 "BRANCO". A cor é parte da chave de
-- agrupamento do /compras (modelo + cor), então cada uma dessas virou uma linha
-- separada — a JETMAX PRETA apareceu com estoque ZERO e urgência crítica,
-- pedindo reposição de uma cor que tinha 9 unidades no showroom.
--
-- A prevenção está no código (`normalizarCor`, aplicada na entrada por XML e na
-- edição manual). Aqui é só o passivo.
--
-- O histórico não é zelo: a edição silenciosa de 24/08/2026 na LYDAE3936T1207627
-- saiu de uma correção sem rastro e a reconstrução do que houve virou dedução.
-- Correção de dado por SQL não passa pela action que grava histórico, então a
-- linha é escrita à mão aqui.

INSERT INTO historico_estoque (moto_id, usuario_id, tipo, observacao)
SELECT m.id,
       (SELECT id FROM usuarios WHERE papel = 'admin_geral' AND ativo ORDER BY nome LIMIT 1),
       'mudanca_status',
       'Correção de cadastro (migração 0091) — Cor: ' || m.cor || ' → ' ||
         CASE m.cor WHEN 'PRETA' THEN 'PRETO' WHEN 'BRANCA' THEN 'BRANCO' END ||
         '. Grafia avulsa da mesma cor separava a moto na contagem por cor do /compras.'
  FROM motos m
 WHERE m.cor IN ('PRETA', 'BRANCA');

UPDATE motos SET cor = 'PRETO'  WHERE cor = 'PRETA';
UPDATE motos SET cor = 'BRANCO' WHERE cor = 'BRANCA';

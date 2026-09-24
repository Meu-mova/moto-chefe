-- Apelidos de modelo usados nas notas de entrada.
--
-- As duas pontas da NF-e escrevem o modelo de jeitos diferentes, e algumas
-- pontas usam um nome que nao existe no catalogo do MOVA: o infCpl da LAIOUNS
-- traz "DRIFT" para o DRIFT CAR e "G5" para o PATINETE G5. Sem um de-para, o
-- chassi nao encontra a ficha fiscal do item e a moto fica sem tributacao.
--
-- Nao da para resolver por semelhanca de texto: "G5" nao e prefixo nem sufixo
-- util de "PATINETE G5", e adivinhar ai geraria nota com a classificacao de
-- outro produto. Entao e cadastro explicito.
--
-- O apelido e a PK: um mesmo apelido nunca pode apontar para dois modelos,
-- senao volta a ambiguidade que a tabela existe para eliminar. Guardado
-- normalizado (caixa alta, sem hifen, espaco simples) como faz normalizarModelo.

CREATE TABLE IF NOT EXISTS modelo_apelidos (
  apelido   text PRIMARY KEY,
  modelo_id uuid NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS modelo_apelidos_modelo_idx ON modelo_apelidos (modelo_id);

-- Os dois casos que o backfill de 24/09/2026 encontrou nas notas da LAIOUNS.
INSERT INTO modelo_apelidos (apelido, modelo_id)
SELECT 'DRIFT', id FROM modelos WHERE modelo = 'DRIFT CAR'
ON CONFLICT (apelido) DO NOTHING;

INSERT INTO modelo_apelidos (apelido, modelo_id)
SELECT 'G5', id FROM modelos WHERE modelo = 'PATINETE G5'
ON CONFLICT (apelido) DO NOTHING;

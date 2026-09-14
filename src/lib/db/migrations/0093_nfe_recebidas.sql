-- src/lib/db/migrations/0093_nfe_recebidas.sql
-- O que a SEFAZ entregou, e de onde continuar lendo.
--
-- `nfe_dfe_sync` é pequena e é a peça mais importante: `ult_nsu` é o ponto de
-- leitura (pular NSU perde nota para sempre) e `proxima_consulta_em` é a trava
-- que impede o consumo indevido — consultar antes da hora depois de um retorno
-- vazio faz a SEFAZ bloquear o CNPJ.
--
-- "Já lançada no MOVA" NÃO é coluna aqui: é junção com motos.nota_fiscal_entrada
-- na hora de montar a tela. Como campo, viraria uma segunda verdade que
-- envelhece sozinha quando a moto é registrada depois.

CREATE TABLE IF NOT EXISTS nfe_recebidas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id       uuid NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  chave          text NOT NULL,
  nsu            text NOT NULL,
  emitente_cnpj  text NOT NULL,
  emitente_nome  text NOT NULL,
  valor          numeric(12,2),
  data_emissao   timestamptz NOT NULL,
  situacao       text NOT NULL DEFAULT 'resumo',   -- resumo | completa | cancelada
  manifestado_em timestamptz,
  xml            text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, chave)
);

CREATE INDEX IF NOT EXISTS nfe_recebidas_grupo_data_idx
  ON nfe_recebidas (grupo_id, data_emissao DESC);

CREATE TABLE IF NOT EXISTS nfe_dfe_sync (
  grupo_id            uuid PRIMARY KEY REFERENCES grupos(id) ON DELETE CASCADE,
  ult_nsu             text NOT NULL DEFAULT '0',
  max_nsu             text NOT NULL DEFAULT '0',
  proxima_consulta_em timestamptz,
  ultimo_cstat        integer,
  ultimo_erro         text,
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

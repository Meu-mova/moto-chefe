-- Ficha fiscal POR MOTO, copiada da NF-e de entrada que a trouxe.
--
-- Corrige a 0102, que guardava a ficha no modelo. O mesmo modelo comercial vem
-- de CNPJs diferentes com classificacao diferente: o X12 entra pela LAIOUNS
-- (09089839000112) como CEST 2600101 / origem 1 / CST 10 e pela Q.P.A
-- (53780554000549) como CEST 2600100 / origem 4 / CST 60. Uma ficha por modelo
-- escolhe uma das duas e emite a outra metade do estoque com origem e ST
-- errados -- e a LAIOUNS e o fornecedor dominante (368 das 522 motos cruzadas).
--
-- A ficha e um SNAPSHOT: e fato historico da entrada daquela moto. Se o
-- fornecedor reclassificar o produto amanha, as motos ja compradas continuam
-- com o que veio na nota delas -- e a NF de saida espelha a de entrada, que e
-- a regra que o Cesar definiu.
--
-- x_prod guarda o nome fiscal LITERAL da nota de entrada, que sai igual na NF
-- de saida. No MOVA a tela continua mostrando o nome comercial (modelos.modelo).

CREATE TABLE IF NOT EXISTS motos_fiscal (
  moto_id            uuid PRIMARY KEY REFERENCES motos(id) ON DELETE CASCADE,

  -- De quem veio: e o que explica duas fichas para o mesmo modelo.
  emitente_cnpj      text NOT NULL,
  emitente_nome      text,
  nf_numero          text,
  nf_chave           text,

  -- Identificacao do item na nota do fornecedor.
  c_prod             text,
  x_prod             text,

  -- O que vai para a NF-e de saida.
  ncm                text NOT NULL,
  cest               text,
  unidade            text,
  origem             text,

  -- Guardados para conferencia, NAO para emitir: o CFOP 5405/6403 e de entrada
  -- e a saida tem o seu (que ainda muda por UF); o CST da entrada informa se a
  -- ST ja foi recolhida, mas a regra de saida e do contador, por grupo.
  cfop_entrada       text,
  cst_icms_entrada   text,
  cst_pis            text,
  cst_cofins         text,
  class_trib_ibscbs  text,

  criado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS motos_fiscal_emitente_idx ON motos_fiscal (emitente_cnpj);

-- Desfaz a 0102: a ficha por modelo nao tem como estar certa e ter as duas
-- fontes so cria a duvida de qual vale na hora de emitir.
ALTER TABLE modelos
  DROP COLUMN IF EXISTS ncm,
  DROP COLUMN IF EXISTS cest,
  DROP COLUMN IF EXISTS unidade,
  DROP COLUMN IF EXISTS origem,
  DROP COLUMN IF EXISTS cst_icms_entrada,
  DROP COLUMN IF EXISTS cst_pis,
  DROP COLUMN IF EXISTS cst_cofins,
  DROP COLUMN IF EXISTS class_trib_ibscbs,
  DROP COLUMN IF EXISTS fiscal_nota,
  DROP COLUMN IF EXISTS fiscal_atualizado_em;

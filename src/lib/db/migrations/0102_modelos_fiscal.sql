-- Ficha fiscal do modelo, semeada pelo XML da NF-e de entrada.
--
-- Primeiro passo para o MOVA emitir nota própria e aposentar o Bling: hoje NCM,
-- CEST, origem e CST vivem lá dentro, alcançados pelo `blingCodigo` do modelo.
-- A fonte escolhida é o XML que já entra pelo módulo Entrada a cada compra —
-- quem classificou o produto foi a fábrica, na nota que nos vendeu.
--
-- Fica no catálogo (global, como o resto de `modelos`) porque NCM e CEST são do
-- PRODUTO, iguais nos dois CNPJs. O que varia por grupo é a regra de SAÍDA
-- (CFOP e CST da nossa nota), que não vem daqui e é decisão do contador.

ALTER TABLE modelos
  ADD COLUMN IF NOT EXISTS ncm                 text,
  ADD COLUMN IF NOT EXISTS cest                text,
  ADD COLUMN IF NOT EXISTS unidade             text,
  -- orig do ICMS: 0 = nacional, 1 = importado direto, 4 = produzido conforme PPB…
  ADD COLUMN IF NOT EXISTS origem              text,
  -- CST (ou CSOSN) do ICMS na ENTRADA. Não é o que sai na nossa nota: serve para
  -- o contador ver que a fábrica já recolheu o ST e definir a saída (CST 60 /
  -- CSOSN 500) uma vez por grupo, em vez de campo por produto.
  ADD COLUMN IF NOT EXISTS cst_icms_entrada    text,
  ADD COLUMN IF NOT EXISTS cst_pis             text,
  ADD COLUMN IF NOT EXISTS cst_cofins          text,
  -- cClassTrib do grupo IBSCBS — a classificação da reforma tributária, que já
  -- vem preenchida nos XMLs de entrada de 2026.
  ADD COLUMN IF NOT EXISTS class_trib_ibscbs   text,
  -- Procedência: de qual nota veio a ficha e quando. Sem isso não dá para saber
  -- se a tributação de um modelo é recente ou herdada de uma compra de 2024.
  ADD COLUMN IF NOT EXISTS fiscal_nota         text,
  ADD COLUMN IF NOT EXISTS fiscal_atualizado_em timestamptz;

-- Serve ao aviso de "N modelos ainda sem ficha fiscal" na tela de Modelos.
CREATE INDEX IF NOT EXISTS modelos_sem_ncm_idx ON modelos (id) WHERE ncm IS NULL;

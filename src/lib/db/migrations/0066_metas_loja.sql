-- Meta de vendas mensal, por loja e em reais.
--
-- Substitui grupos.meta_motos_mes, que era uma meta só por bandeira, em
-- quantidade de motos e sem dimensão de mês. Três problemas de uma vez:
--
--   1. Por bandeira. Sul de Minas tem seis lojas de portes diferentes; uma meta
--      de 200 motos no grupo não diz a ninguém o que a loja de Lavras precisa
--      fazer. Cobrança é por loja.
--   2. Em unidades. Vender dez motos baratas não é o mesmo resultado que vender
--      dez caras, e a conversa da reunião é em faturamento.
--   3. Sem mês. Mudar a meta reescrevia o passado — agosto passava a ser julgado
--      pela meta de setembro. Aqui cada mês guarda a sua, e o histórico fica.
--
-- O grupo não é coluna daqui: vem da loja. Duplicar abriria a chance de a meta
-- apontar para um grupo e a loja para outro.
--
-- Sem semente: a meta antiga era em motos e não há como convertê-la em reais sem
-- inventar um preço médio. As metas nascem vazias e são cadastradas em
-- /admin/metas. Mês sem meta cadastrada simplesmente não aparece no dashboard.
CREATE TABLE IF NOT EXISTS metas_loja (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id        uuid NOT NULL REFERENCES lojas(id),
  ano            integer NOT NULL,
  mes            integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- Valor cheio da venda (vendas.valor), não o líquido de taxas: é o preço que o
  -- vendedor fecha com o cliente e o número que o ranking do dashboard já mostra.
  valor_meta     numeric(12,2) NOT NULL CHECK (valor_meta >= 0),
  atualizado_em  timestamp NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES usuarios(id),
  -- Uma meta por loja por mês. É também o alvo do ON CONFLICT no salvamento da
  -- grade inteira, que faz upsert de todas as lojas de uma vez.
  CONSTRAINT metas_loja_unica UNIQUE (loja_id, ano, mes)
);

-- A leitura do dashboard é sempre "as metas destas lojas neste mês".
CREATE INDEX IF NOT EXISTS metas_loja_periodo_idx ON metas_loja (ano, mes);

COMMENT ON COLUMN grupos.meta_motos_mes IS
  'OBSOLETO desde 0066: a meta virou metas_loja (por loja, em R$, por mês). Nada lê esta coluna.';

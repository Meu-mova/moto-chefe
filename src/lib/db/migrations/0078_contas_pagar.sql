-- 0078_contas_pagar.sql
-- Contas a pagar: compromissos de pagamento, NÃO lançamento financeiro.
--
-- Não encosta em despesas, caixa, DRE nem financeiro de propósito — quem paga
-- lança a despesa normalmente por lá. Aqui é só a agenda do que vence, para não
-- perder vencimento (que é o que acontece hoje quando a data passa no calendário
-- e não existe onde marcar "pago").
--
-- Duas tabelas: o CADASTRO (contas_pagar), que descreve o compromisso, e as
-- OCORRÊNCIAS (contas_pagar_ocorrencias), uma por mês de competência. O check de
-- pago mora na ocorrência, senão marcar setembro apagaria o histórico de agosto.

CREATE TABLE IF NOT EXISTS contas_pagar (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id           uuid NOT NULL REFERENCES grupos(id),
  -- NULL = compromisso da empresa toda; preenchido = de uma loja específica.
  loja_id            uuid REFERENCES lojas(id),
  descricao          text NOT NULL,
  categoria          text,
  -- 'unica'       — vence uma vez, na data cadastrada
  -- 'recorrente'  — todo mês, no mesmo dia, com valor fixo
  -- 'automatica'  — todo mês, com valor calculado sobre o mês ANTERIOR
  tipo               text NOT NULL,
  -- Fixo nas de valor conhecido; NULL nas automáticas, onde o valor é calculado.
  valor              numeric(12,2),
  -- Única usa a data cheia; recorrente e automática usam só o dia do mês.
  data_vencimento    date,
  dia_vencimento     integer,
  -- Automática: percentual sobre uma base do mês anterior. Ex.: imposto de 6%
  -- sobre a venda de motos. A base é configurável porque "venda do mês" pode ser
  -- tudo que foi vendido ou só o que teve nota fiscal emitida, e isso muda o valor.
  formula_base       text,
  formula_percentual numeric(6,3),
  -- Vigência em 'YYYY-MM', mesma convenção do resto do sistema: comparada como
  -- texto, ordena igual à data e não pega fuso. NULL nos dois lados = sem limite.
  inicio             text,
  fim                text,
  ativo              boolean NOT NULL DEFAULT true,
  observacao         text,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  criado_por         uuid REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS contas_pagar_grupo_idx ON contas_pagar (grupo_id, ativo);

CREATE TABLE IF NOT EXISTS contas_pagar_ocorrencias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id     uuid NOT NULL REFERENCES contas_pagar(id) ON DELETE CASCADE,
  competencia  text NOT NULL,
  vencimento   date NOT NULL,
  valor        numeric(12,2) NOT NULL,
  pago         boolean NOT NULL DEFAULT false,
  pago_em      date,
  pago_por     uuid REFERENCES usuarios(id),
  observacao   text,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

-- Uma ocorrência por conta/competência. É o que deixa a geração do mês idempotente:
-- abrir a tela dez vezes não cria dez cobranças, e nunca sobrescreve uma já paga.
CREATE UNIQUE INDEX IF NOT EXISTS contas_pagar_ocorrencia_unica
  ON contas_pagar_ocorrencias (conta_id, competencia);
CREATE INDEX IF NOT EXISTS contas_pagar_ocorrencias_venc_idx
  ON contas_pagar_ocorrencias (vencimento, pago);

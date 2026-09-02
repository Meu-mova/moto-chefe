-- 0086_folha_valor_real.sql
-- Valor real pago por funcionário no mês: o líquido que a contabilidade
-- efetivamente depositou, digitado na última coluna da folha.
--
-- Tabela própria e não coluna em funcionarios_config porque config é cadastro,
-- sem competência — este valor muda todo mês.
CREATE TABLE IF NOT EXISTS folha_valores_reais (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id     uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- 'YYYY-MM' em text, como o resto do módulo de folha: comparado como string,
  -- ordena igual à data e não cai no fuso.
  mes            text NOT NULL,
  valor          numeric(12,2) NOT NULL,
  atualizado_por uuid REFERENCES usuarios(id),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

-- Um valor por pessoa/mês. Digitar de novo corrige em vez de acumular duas
-- linhas, que é o caso comum: a contabilidade manda o holerite corrigido.
CREATE UNIQUE INDEX IF NOT EXISTS folha_valores_reais_pessoa_mes_idx
  ON folha_valores_reais (usuario_id, mes);

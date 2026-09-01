-- 0076_regras_comissao.sql
-- Várias regras de comissão/premiação por funcionário.
--
-- Até aqui cada pessoa tinha UMA regra, presa em funcionarios_config
-- (comissao_percentual + base_comissao). Não dava para a Julia Sampaio receber 5%
-- sobre as peças que ela vende E 0,2% sobre as motos da loja dela como premiação.
--
-- `vigencia_inicio` NULL = "sempre valeu". É o que as regras migradas recebem, de
-- propósito: a folha é recalculada na hora a cada abertura, então dar uma data de
-- início às regras antigas mudaria o valor de meses já pagos. Regra NOVA nasce com
-- o mês de início preenchido pela tela.
CREATE TABLE IF NOT EXISTS folha_regras_comissao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- 'comissao' | 'premiacao'. Separadas porque saem em colunas diferentes da folha
  -- e da conversa com o funcionário, mesmo que a conta seja a mesma.
  tipo            text NOT NULL,
  -- Ver BASES_COMISSAO em src/lib/folha.ts.
  base            text NOT NULL,
  percentual      numeric(6,3) NOT NULL,
  -- 'YYYY-MM', comparados como texto (ordenam como data e não pegam fuso), mesma
  -- convenção de folha_ajustes_base.mes.
  vigencia_inicio text,
  vigencia_fim    text,
  descricao       text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  criado_por      uuid REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS folha_regras_comissao_usuario_idx ON folha_regras_comissao (usuario_id);

-- Migra o que existe hoje: uma regra de comissão por pessoa que tem percentual.
-- Sem vigência, para os meses já fechados continuarem dando o mesmo número.
-- Guarda contra rodar duas vezes: só insere quem ainda não tem regra nenhuma.
INSERT INTO folha_regras_comissao (usuario_id, tipo, base, percentual, descricao)
SELECT c.usuario_id, 'comissao', c.base_comissao, c.comissao_percentual,
       'Migrado da configuração anterior'
FROM funcionarios_config c
WHERE c.comissao_percentual::numeric > 0
  AND NOT EXISTS (
    SELECT 1 FROM folha_regras_comissao r WHERE r.usuario_id = c.usuario_id
  );

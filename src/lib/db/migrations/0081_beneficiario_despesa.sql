-- 0081_beneficiario_despesa.sql
-- A quem se destinou a retirada / o pró-labore.
--
-- "Retiradas" e "Pró-Labore" saem no nome da empresa, mas o dinheiro é de um sócio
-- específico. Sem esse campo o extrato mostra R$ X em retiradas e não dá para
-- saber quanto foi de cada um.
--
-- A exigência mora na CATEGORIA, e não numa lista de nomes no código: é onde já
-- moram conta_como_despesa, motivo_nao_operacional e grupo_dre, e assim uma
-- categoria nova ("Distribuição de lucros") passa a pedir beneficiário sem deploy.
ALTER TABLE categorias_despesa
  ADD COLUMN IF NOT EXISTS exige_beneficiario boolean NOT NULL DEFAULT false;

UPDATE categorias_despesa
   SET exige_beneficiario = true
 WHERE nome IN ('Retiradas', 'Pró-Labore');

ALTER TABLE despesas
  ADD COLUMN IF NOT EXISTS beneficiario text;

-- Catálogo por grupo, e não constante no código: cada bandeira tem seus sócios, e
-- entrada/saída de sócio não pode depender de deploy.
CREATE TABLE IF NOT EXISTS beneficiarios_despesa (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id  uuid NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  nome      text NOT NULL,
  ordem     integer NOT NULL DEFAULT 0,
  ativo     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS beneficiarios_despesa_unico
  ON beneficiarios_despesa (grupo_id, nome);

-- Os quatro sócios, em todos os grupos ativos. Quem não for sócio de um grupo é
-- desativado pela tela — melhor sobrar nome para tirar do que faltar na hora de
-- lançar a retirada.
INSERT INTO beneficiarios_despesa (grupo_id, nome, ordem)
SELECT g.id, x.nome, x.ordem
FROM grupos g
CROSS JOIN (VALUES ('Cesar', 1), ('João', 2), ('Luiz Paulo', 3), ('Mateus', 4)) AS x(nome, ordem)
WHERE g.ativo = true
ON CONFLICT (grupo_id, nome) DO NOTHING;

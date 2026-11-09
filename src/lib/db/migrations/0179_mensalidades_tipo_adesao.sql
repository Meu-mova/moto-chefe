-- Cobrança da adesão no 1º acesso (#802, #803).
--
-- Reusa a tabela mensalidades em vez de criar uma própria (AGENTS.md, "Tabela também", #655):
-- a adesão tem o mesmo ciclo (aberta -> paga), o mesmo link e a mesma baixa do Mercado Pago
-- (o webhook acha a linha pelo id), o mesmo bloqueio e o mesmo filtro de Conta pelo grupo_id.
-- Só a competência atrapalhava: a adesão não é de um mês, então fica nula só nela.
ALTER TABLE mensalidades
  ADD COLUMN tipo text NOT NULL DEFAULT 'mensalidade' CHECK (tipo IN ('mensalidade', 'adesao'));

ALTER TABLE mensalidades ALTER COLUMN competencia DROP NOT NULL;
ALTER TABLE mensalidades
  ADD CONSTRAINT mensalidades_competencia_por_tipo CHECK ((tipo = 'adesao') = (competencia IS NULL));

-- Uma cobrança de adesão por grupo: acessos simultâneos não cobram duas vezes. A unicidade
-- (grupo_id, competencia) das mensalidades continua; competência nula não colide nela.
CREATE UNIQUE INDEX mensalidades_uma_adesao_por_grupo ON mensalidades (grupo_id) WHERE tipo = 'adesao';

-- Versão da cobrança gravada no envio do contrato: 1 = taxa junto da 1ª mensalidade (todo
-- contrato que já existe, decisão A1 do Luis); 2 = adesão cobrada no 1º acesso.
ALTER TABLE contratos_adesao
  ADD COLUMN versao_cobranca smallint NOT NULL DEFAULT 1 CHECK (versao_cobranca IN (1, 2));

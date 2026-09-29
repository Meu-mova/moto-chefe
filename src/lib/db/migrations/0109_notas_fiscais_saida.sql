-- Cada tentativa de emissão de NF-e própria (Nota Gateway), uma linha por id
-- externo. Negada não se apaga: fica o motivo, e a próxima tentativa ganha id
-- novo. Homologação convive na mesma tabela, separada pela coluna ambiente --
-- nota de teste NUNCA marca a venda como faturada.
CREATE TABLE IF NOT EXISTS notas_fiscais_saida (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id        uuid NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  grupo_id        uuid NOT NULL REFERENCES grupos(id),
  id_externo      text NOT NULL UNIQUE,
  ambiente        text NOT NULL,
  status          text NOT NULL DEFAULT 'Enviando',
  motivo_status   text,
  numero          text,
  serie           text,
  chave           text,
  protocolo       text,
  link_danfe      text,
  link_xml        text,
  payload         jsonb NOT NULL,
  emitida_por     uuid REFERENCES usuarios(id),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notas_fiscais_saida_venda_idx ON notas_fiscais_saida (venda_id, criado_em DESC);

-- Em produção, no máximo UMA nota viva por venda. É a trava contra emitir duas
-- vezes com dois cliques ou duas abas.
CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_saida_uma_viva_idx
  ON notas_fiscais_saida (venda_id)
  WHERE ambiente = 'Producao' AND status IN ('Enviando', 'Processando', 'Autorizada');

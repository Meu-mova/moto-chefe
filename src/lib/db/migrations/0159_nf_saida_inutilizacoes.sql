-- Inutilização do número de NF-e de saída rejeitada que não vai ser reenviada (#504).
-- Negada não se apaga: fica o motivo, e o número volta a poder ser pedido.
CREATE TABLE IF NOT EXISTS notas_fiscais_saida_inutilizacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id         uuid NOT NULL REFERENCES notas_fiscais_saida(id),
  grupo_id        uuid NOT NULL REFERENCES grupos(id),
  id_externo      text NOT NULL UNIQUE,
  ambiente        text NOT NULL,
  serie           text NOT NULL,
  numero_inicial  integer NOT NULL,
  numero_final    integer NOT NULL,
  justificativa   text NOT NULL CHECK (char_length(justificativa) BETWEEN 15 AND 255),
  -- Nossa leitura do status; os nomes da API ficam em status e podem mudar.
  situacao        text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente', 'autorizada', 'negada')),
  status          text NOT NULL DEFAULT 'Enviando',
  motivo_status   text,
  protocolo       text,
  pedida_por      uuid REFERENCES usuarios(id),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CHECK (numero_inicial BETWEEN 1 AND numero_final)
);

-- Trava contra dois pedidos do mesmo número: o segundo bate aqui.
CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_saida_inutilizacoes_numero_idx
  ON notas_fiscais_saida_inutilizacoes (grupo_id, ambiente, serie, numero_inicial)
  WHERE situacao <> 'negada';

-- Sem policy: acesso só pelo servidor (Drizzle), como as demais tabelas fiscais.
ALTER TABLE notas_fiscais_saida_inutilizacoes ENABLE ROW LEVEL SECURITY;

-- Cartas de correção das NF de saída (#187). Recusada não se apaga: fica o motivo,
-- e o número dela volta a ficar livre para a próxima tentativa (com id externo novo).
CREATE TABLE IF NOT EXISTS notas_fiscais_saida_cartas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id         uuid NOT NULL REFERENCES notas_fiscais_saida(id),
  grupo_id        uuid NOT NULL REFERENCES grupos(id),
  id_externo      text NOT NULL UNIQUE,
  ambiente        text NOT NULL,
  numero          integer NOT NULL CHECK (numero BETWEEN 1 AND 20),
  correcao        text NOT NULL,
  -- Nossa leitura do status; os nomes da API ficam em status e podem mudar.
  situacao        text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente', 'autorizada', 'recusada')),
  status          text NOT NULL DEFAULT 'Enviando',
  motivo_status   text,
  protocolo       text,
  emitida_por     uuid REFERENCES usuarios(id),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- Trava contra dois envios simultâneos da mesma carta: o segundo bate aqui.
CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_saida_cartas_numero_idx
  ON notas_fiscais_saida_cartas (nota_id, numero)
  WHERE situacao <> 'recusada';

-- Sem policy: acesso só pelo servidor (Drizzle), como as demais tabelas fiscais.
ALTER TABLE notas_fiscais_saida_cartas ENABLE ROW LEVEL SECURITY;

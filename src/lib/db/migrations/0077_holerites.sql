-- 0077_holerites.sql
-- Holerites que a contabilidade manda todo mês, em PDF: um de adiantamento e um
-- de pagamento do salário, por funcionário.
--
-- Bucket PRIVADO e separado de 'comprovantes': holerite tem salário de gente
-- dentro, e misturar com comprovante de caixa faria uma política de acesso valer
-- para os dois. O arquivo só é servido por URL assinada de 10 minutos, gerada
-- depois de conferir quem está pedindo — ver getHoleriteUrlAction.
INSERT INTO storage.buckets (id, name, public)
VALUES ('holerites', 'holerites', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS holerites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- 'YYYY-MM' em text, como o resto do módulo de folha: comparado como string,
  -- ordena igual à data e não cai no fuso.
  mes          text NOT NULL,
  -- 'adiantamento' | 'salario'
  tipo         text NOT NULL,
  -- Caminho dentro do bucket, nunca URL: a URL é assinada na hora de abrir.
  arquivo_path text NOT NULL,
  -- Nome do arquivo como veio da contabilidade, para o download sair reconhecível.
  arquivo_nome text NOT NULL,
  tamanho      integer,
  enviado_por  uuid REFERENCES usuarios(id),
  enviado_em   timestamptz NOT NULL DEFAULT now()
);

-- Um holerite por pessoa/mês/tipo. Reenviar substitui em vez de acumular duas
-- versões do mesmo documento, que é como a contabilidade corrige um erro.
CREATE UNIQUE INDEX IF NOT EXISTS holerites_pessoa_mes_tipo_idx
  ON holerites (usuario_id, mes, tipo);

CREATE TABLE "categorias_despesa" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome"       text NOT NULL,
  "ativo"      boolean DEFAULT true NOT NULL,
  "ordem"      integer DEFAULT 0 NOT NULL,
  "criado_em"  timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "categorias_despesa" ("nome", "ordem") VALUES
  ('Aluguel', 0),
  ('Energia elétrica', 1),
  ('Água', 2),
  ('Internet', 3),
  ('Combustível', 4),
  ('Compra de veículos', 5),
  ('Marketing', 6),
  ('Salários', 7),
  ('Impostos', 8),
  ('Manutenção', 9),
  ('Outros', 10);

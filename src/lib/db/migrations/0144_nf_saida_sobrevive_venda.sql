-- #347: cancelar a venda apagava as NFs de saída dela (ON DELETE CASCADE),
-- inclusive negadas e canceladas, que a contabilidade precisa. A NF passa a
-- sobreviver com venda_id nulo e guarda o número da venda.
-- O nome da FK vem do catálogo: drop com nome errado não falha nem avisa.
DO $$
DECLARE fk text;
BEGIN
  SELECT c.conname INTO STRICT fk
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
   WHERE c.conrelid = 'notas_fiscais_saida'::regclass AND c.contype = 'f' AND a.attname = 'venda_id';
  EXECUTE format('ALTER TABLE notas_fiscais_saida DROP CONSTRAINT %I', fk);
END $$;

ALTER TABLE notas_fiscais_saida ALTER COLUMN venda_id DROP NOT NULL;
ALTER TABLE notas_fiscais_saida
  ADD CONSTRAINT notas_fiscais_saida_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE SET NULL;

ALTER TABLE notas_fiscais_saida ADD COLUMN venda_numero integer;
UPDATE notas_fiscais_saida n SET venda_numero = v.numero FROM vendas v WHERE v.id = n.venda_id;
ALTER TABLE notas_fiscais_saida ALTER COLUMN venda_numero SET NOT NULL;

-- Entre aplicar esta migração na produção e o deploy, o código antigo grava a NF
-- sem venda_numero; o trigger preenche pela venda e a emissão não falha.
CREATE OR REPLACE FUNCTION notas_fiscais_saida_venda_numero() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.venda_numero IS NULL AND NEW.venda_id IS NOT NULL THEN
    SELECT numero INTO NEW.venda_numero FROM vendas WHERE id = NEW.venda_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER notas_fiscais_saida_venda_numero
  BEFORE INSERT ON notas_fiscais_saida
  FOR EACH ROW EXECUTE FUNCTION notas_fiscais_saida_venda_numero();

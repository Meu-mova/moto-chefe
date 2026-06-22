-- Sequência global de números de venda/pedido, iniciando em 30000
CREATE SEQUENCE IF NOT EXISTS numero_venda_seq START WITH 30000;

-- pedidos_venda: numero auto a partir da sequência
ALTER TABLE pedidos_venda ADD COLUMN IF NOT EXISTS numero integer;
UPDATE pedidos_venda SET numero = nextval('numero_venda_seq') WHERE numero IS NULL;
ALTER TABLE pedidos_venda ALTER COLUMN numero SET NOT NULL;
ALTER TABLE pedidos_venda ADD CONSTRAINT pedidos_venda_numero_unique UNIQUE (numero);
ALTER TABLE pedidos_venda ALTER COLUMN numero SET DEFAULT nextval('numero_venda_seq');

-- vendas: numero herdado do pedido_venda vinculado
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS numero integer;
UPDATE vendas v SET numero = pv.numero FROM pedidos_venda pv WHERE v.pedido_venda_id = pv.id;
ALTER TABLE vendas ALTER COLUMN numero SET NOT NULL;
ALTER TABLE vendas ADD CONSTRAINT vendas_numero_unique UNIQUE (numero);

-- Trigger: ao inserir venda, copia o numero do pedido automaticamente
CREATE OR REPLACE FUNCTION fn_set_venda_numero()
RETURNS TRIGGER AS $$
BEGIN
  SELECT numero INTO NEW.numero FROM pedidos_venda WHERE id = NEW.pedido_venda_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_venda_numero ON vendas;
CREATE TRIGGER trg_set_venda_numero
  BEFORE INSERT ON vendas
  FOR EACH ROW EXECUTE FUNCTION fn_set_venda_numero();

-- reservas: numero auto a partir da mesma sequência
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS numero integer;
UPDATE reservas SET numero = nextval('numero_venda_seq') WHERE numero IS NULL;
ALTER TABLE reservas ALTER COLUMN numero SET NOT NULL;
ALTER TABLE reservas ADD CONSTRAINT reservas_numero_unique UNIQUE (numero);
ALTER TABLE reservas ALTER COLUMN numero SET DEFAULT nextval('numero_venda_seq');

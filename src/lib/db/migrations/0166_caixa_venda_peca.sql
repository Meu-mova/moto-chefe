-- Venda de peças em dinheiro entra no caixa da loja, como moto e OS (#546).
ALTER TABLE lancamentos_caixa ADD COLUMN IF NOT EXISTS venda_peca_id uuid REFERENCES vendas_pecas(id);
CREATE INDEX IF NOT EXISTS lancamentos_caixa_venda_peca_idx ON lancamentos_caixa (venda_peca_id) WHERE venda_peca_id IS NOT NULL;

-- Só as vendas criadas daqui em diante lançam sozinhas. A antiga fica false: a loja lança
-- à mão, e editá-la não pode criar uma segunda entrada.
ALTER TABLE vendas_pecas ADD COLUMN IF NOT EXISTS caixa_automatico boolean NOT NULL DEFAULT false;

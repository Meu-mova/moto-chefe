-- RENAVE (veicProd) do ciclomotor.

-- tpPint da nota de entrada da moto (J18): a saída repete, como o xProd.
ALTER TABLE motos_fiscal ADD COLUMN IF NOT EXISTS tp_pint text;

-- Unidade em que a potência foi para a nota (escolha da loja: W ou CV). O que já foi
-- enviado até aqui era CV.
ALTER TABLE motos_renave ADD COLUMN IF NOT EXISTS unidade_potencia text NOT NULL DEFAULT 'CV'
  CHECK (unidade_potencia IN ('W', 'CV'));

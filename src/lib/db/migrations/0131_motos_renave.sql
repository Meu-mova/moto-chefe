-- Detalhamento de veículo novo da NF-e de saída (grupo veicProd), que o RENAVE
-- usa para o emplacamento. Só o ciclomotor leva.
--
-- Quem emite preenche no ato do envio; chassi e motor vêm do cadastro da moto
-- e podem ser editados. Fica POR MOTO, como a motos_fiscal: é o que foi enviado
-- na nota daquela moto, e volta preenchido numa nova tentativa. O chassi daqui
-- é o da nota; não altera motos.chassi. O que é do modelo (potência, pesos,
-- código RENAVAM) a tela sugere a partir da última moto do mesmo modelo.
--
-- Os campos guardam o vocabulário da API da Nota Gateway (ex.: 'VendaConcessionaria',
-- 'Prata', '07'), validado em src/lib/notagateway/veiculo.ts.

CREATE TABLE IF NOT EXISTS motos_renave (
  moto_id                  uuid PRIMARY KEY REFERENCES motos(id) ON DELETE CASCADE,
  chassi                   text NOT NULL,
  tipo_operacao            text NOT NULL,
  cor_codigo               text NOT NULL,
  cor_descricao            text NOT NULL,
  cor_denatran             text NOT NULL,
  potencia_motor           text NOT NULL,
  cilindradas              text NOT NULL,
  peso_liquido             numeric(9, 4) NOT NULL,
  peso_bruto               numeric(9, 4) NOT NULL,
  numero_serie             text NOT NULL,
  tipo_combustivel         text NOT NULL,
  numero_motor             text NOT NULL,
  capacidade_maxima_tracao numeric(9, 4) NOT NULL,
  distancia_eixos          text NOT NULL,
  ano_modelo               integer NOT NULL,
  ano_fabricacao           integer NOT NULL,
  tipo_pintura             text NOT NULL,
  tipo_veiculo             text NOT NULL,
  especie                  text NOT NULL,
  condicao_vin             text NOT NULL,
  condicao                 text NOT NULL,
  codigo_marca_modelo      text NOT NULL,
  lotacao                  integer NOT NULL,
  restricao                text NOT NULL,
  preenchido_por           uuid REFERENCES usuarios(id),
  criado_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em            timestamptz NOT NULL DEFAULT now()
);

-- Sem policy: acesso só pelo servidor (Drizzle), como as demais tabelas fiscais.
ALTER TABLE motos_renave ENABLE ROW LEVEL SECURITY;

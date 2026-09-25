-- Emissao de NF-e propria pela Nota Gateway, substituindo o Bling.
--
-- Duas tabelas, ambas POR GRUPO: credencial e regra de saida. Sao dois CNPJs
-- com contabilidade separada, entao nada aqui pode ser global.

-- ─── credencial da Nota Gateway ─────────────────────────────────────────────
-- O token vai cifrado (src/lib/cripto.ts), como o certificado A1. O empresaId
-- e devolvido pela API no cadastro da empresa e usado em toda chamada seguinte.
CREATE TABLE IF NOT EXISTS notagateway_config (
  grupo_id      uuid PRIMARY KEY REFERENCES grupos(id) ON DELETE CASCADE,
  token         text NOT NULL,
  empresa_id    text,
  -- 'Homologacao' ou 'Producao'. Vai no payload de cada nota, entao da para
  -- testar em homologacao com a mesma credencial da producao.
  ambiente      text NOT NULL DEFAULT 'Homologacao',
  serie_nfe     text NOT NULL DEFAULT '1',
  proximo_numero integer NOT NULL DEFAULT 1,
  certificado_enviado_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- ─── regra fiscal de saida ──────────────────────────────────────────────────
-- O que a NOSSA nota leva, que nao vem do XML de entrada. Extraida das ~200
-- notas que o grupo ja emitiu pelo Bling e a SEFAZ aceitou -- nao e palpite.
CREATE TABLE IF NOT EXISTS regras_fiscais_saida (
  grupo_id uuid PRIMARY KEY REFERENCES grupos(id) ON DELETE CASCADE,

  natureza_operacao text NOT NULL,

  -- Dentro da UF do emitente.
  cfop_interno     text NOT NULL,
  cst_icms_interno text NOT NULL,

  -- Fora da UF: e outra operacao, nao so outro CFOP. Em MG a venda interna sai
  -- CST 60 (ST ja recolhida) e a interestadual sai CST 00 com ICMS destacado.
  cfop_interestadual         text NOT NULL,
  cst_icms_interestadual     text NOT NULL,
  aliquota_icms_interestadual numeric(5,2),

  cst_pis         text NOT NULL,
  aliquota_pis    numeric(6,4),
  cst_cofins      text NOT NULL,
  aliquota_cofins numeric(6,4),
  cst_ipi         text,

  -- Reforma tributaria. Ja vem preenchido nos XMLs de entrada de 2026.
  cst_ibscbs        text,
  class_trib_ibscbs text,

  -- CRT do emitente: 3 = Regime Normal. O exemplo da doc da Nota Gateway usa
  -- CSOSN 102 (Simples), que NAO e o caso destes grupos.
  crt integer NOT NULL DEFAULT 3,

  -- NULL = usa a origem da ficha da moto (a real, da nota de entrada).
  -- Preenchido = forca esse valor em toda saida, que e o que o Bling faz hoje.
  -- Pendente de resposta do contador; parametrizado para trocar num lugar so.
  origem_fixa text,

  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Sul de Minas: extraido de 198 notas de saida do Bling (194 MG + 4 SP).
-- BH fica de fora de proposito -- nao emite pelo Bling, entao nao ha o que
-- copiar, e chutar a regra de outro CNPJ seria inventar tributacao.
INSERT INTO regras_fiscais_saida (
  grupo_id, natureza_operacao,
  cfop_interno, cst_icms_interno,
  cfop_interestadual, cst_icms_interestadual, aliquota_icms_interestadual,
  cst_pis, aliquota_pis, cst_cofins, aliquota_cofins, cst_ipi,
  cst_ibscbs, class_trib_ibscbs, crt, origem_fixa
)
SELECT id, 'Venda de mercadoria com ST',
       '5405', '60',
       '6404', '00', 12.00,
       '01', 0.6500, '01', 3.0000, '99',
       '000', '000001', 3, '0'
  FROM grupos WHERE nome = 'Sul de Minas'
ON CONFLICT (grupo_id) DO NOTHING;

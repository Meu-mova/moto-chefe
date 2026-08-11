-- Checklist de entrega preenchido pelo comprador: OK / NÃO / NA por item, mais
-- observações em texto livre.
--
-- dados_json guarda os dados estruturados do documento (DadosDocumento) para
-- que o HTML definitivo possa ser remontado no momento da assinatura, já com as
-- marcações do comprador. Sem isso só existiria o HTML em branco congelado no
-- envio, e o que ele marcou ficaria de fora do documento que ele assinou.

ALTER TABLE documentos_assinatura
  ADD COLUMN IF NOT EXISTS respostas_json jsonb,
  ADD COLUMN IF NOT EXISTS dados_json     jsonb;

COMMENT ON COLUMN documentos_assinatura.respostas_json IS
  'Checklist preenchido pelo comprador: { itens: { "<item>": "ok|nao|na" }, observacoes: text }';

-- Logo da loja no DANFE da NF de saída (#428). A NG guarda a logo da empresa e não
-- tem como consultá-la; a cópia aqui é o que a tela mostra como logo atual.
alter table notagateway_config add column logo_enviada_em timestamptz;
alter table notagateway_config add column logo_enviada_por uuid references usuarios(id) on delete set null;

-- Lista inteira da 0145 mais o tipo novo.
alter table log_acoes drop constraint log_acoes_tipo_check;
alter table log_acoes add constraint log_acoes_tipo_check check (tipo in (
  'login', 'troca_grupo', 'acesso_dia',
  'venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada',
  'certificado_aplicado', 'portal_aplicado', 'notas_enviadas_contador',
  'logo_danfe_enviada'
));

-- Sem expiração: logo não é dado pessoal nem fiscal (decisão do Luis, 26/10).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos-danfe', 'logos-danfe', false, 5242880, array['image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;

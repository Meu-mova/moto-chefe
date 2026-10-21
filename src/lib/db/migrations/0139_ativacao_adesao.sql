-- "Ativar cliente" a partir da adesão (#292, fatia 1).
-- O certificado A1 e as senhas saem da adesão logo que são aplicados (decisão do
-- Luis, 21/10): o segredo passa a existir num lugar só. Fica a data de cada passo.

alter table adesoes_mova alter column cert_arquivo drop not null;
alter table adesoes_mova alter column cert_senha drop not null;
alter table adesoes_mova alter column store_senha drop not null;

alter table adesoes_mova add column certificado_aplicado_em timestamptz;
alter table adesoes_mova add column portal_aplicado_em timestamptz;

alter table log_acoes drop constraint log_acoes_tipo_check;
alter table log_acoes add constraint log_acoes_tipo_check check (tipo in (
  'login', 'troca_grupo', 'acesso_dia',
  'venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada',
  'certificado_aplicado', 'portal_aplicado'
));

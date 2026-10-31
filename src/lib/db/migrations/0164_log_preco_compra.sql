-- Correção do preço de compra de moto no log de ações sensíveis (#514).
alter table log_acoes drop constraint log_acoes_tipo_check;
alter table log_acoes add constraint log_acoes_tipo_check check (tipo in (
  'login', 'troca_grupo', 'acesso_dia',
  'venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada',
  'certificado_aplicado', 'portal_aplicado', 'notas_enviadas_contador',
  'logo_danfe_enviada', 'preco_compra_alterado'
));

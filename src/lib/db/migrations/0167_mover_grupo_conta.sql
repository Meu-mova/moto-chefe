-- Mover grupo para outra Conta (#554, adendo de 2026-10-31 ao ADR-0018).
-- A Conta de origem é desativada, não apagada: o log de ações aponta para ela.
alter table contas add column if not exists desativada_em timestamptz;

alter table log_acoes drop constraint log_acoes_tipo_check;
alter table log_acoes add constraint log_acoes_tipo_check check (tipo in (
  'login', 'troca_grupo', 'acesso_dia',
  'venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada',
  'certificado_aplicado', 'portal_aplicado', 'notas_enviadas_contador',
  'logo_danfe_enviada', 'preco_compra_alterado', 'grupo_movido_de_conta'
));

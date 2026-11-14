-- Cada alteração da Entrega (efetivação ou depois da venda) vai para o log de ações com antes e depois (#895).
-- A lista inteira é repetida: recriar o check sem um tipo proíbe gravar esse tipo.
alter table log_acoes drop constraint log_acoes_tipo_check;
alter table log_acoes add constraint log_acoes_tipo_check check (tipo in (
  'login', 'troca_grupo', 'acesso_dia',
  'venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada',
  'certificado_aplicado', 'portal_aplicado', 'notas_enviadas_contador',
  'logo_danfe_enviada', 'preco_compra_alterado', 'grupo_movido_de_conta',
  'transferencia_grupos_alterada', 'moto_arquivada', 'moto_desarquivada',
  'moto_removida', 'entrega_alterada'
));

-- Moto arquivada: sai de toda tela, lista, contagem e busca, e só o RADAR a acha.
-- Para moto que não é mais da loja nem foi vendida, como as do golpe de link de
-- pagamento de outubro/2026 (venda cancelada, chassi marcado "GOLPE"). O registro e o
-- histórico ficam; apagar tiraria a moto do RADAR.
alter table motos add column if not exists arquivada_em timestamptz;
alter table motos add column if not exists arquivada_por uuid references usuarios(id);
alter table motos add column if not exists motivo_arquivo text;

-- Os três andam juntos: arquivada tem quem e por quê; não arquivada, nenhum dos dois.
alter table motos add constraint motos_arquivo_completo check (
  (arquivada_em is null and arquivada_por is null and motivo_arquivo is null)
  or (arquivada_em is not null and arquivada_por is not null and coalesce(btrim(motivo_arquivo), '') <> '')
);

-- Cada moto arquivada vai para o log de ações sensíveis (#688).
alter table log_acoes drop constraint log_acoes_tipo_check;
alter table log_acoes add constraint log_acoes_tipo_check check (tipo in (
  'login', 'troca_grupo', 'acesso_dia',
  'venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada',
  'certificado_aplicado', 'portal_aplicado', 'notas_enviadas_contador',
  'logo_danfe_enviada', 'preco_compra_alterado', 'grupo_movido_de_conta',
  'transferencia_grupos_alterada', 'moto_arquivada'
));

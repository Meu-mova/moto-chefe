-- Série e última nota com o tamanho do leiaute da NF-e (série até 3 dígitos, número até 9),
-- na adesão e na correção do admin. Sem dado fora disso: a 0169 é de 01/11.
alter table adesoes_mova
  add constraint adesoes_mova_nf_serie_tamanho check (char_length(nf_serie_anterior) <= 3),
  add constraint adesoes_mova_nf_ultimo_tamanho check (char_length(nf_ultimo_numero) <= 9);

-- Correção da numeração informada na adesão pelo admin_geral (#588) vai para o log.
alter table log_acoes drop constraint log_acoes_tipo_check;
alter table log_acoes add constraint log_acoes_tipo_check check (tipo in (
  'login', 'troca_grupo', 'acesso_dia',
  'venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada',
  'certificado_aplicado', 'portal_aplicado', 'notas_enviadas_contador',
  'logo_danfe_enviada', 'preco_compra_alterado', 'grupo_movido_de_conta',
  'transferencia_grupos_alterada', 'numeracao_adesao_alterada'
));

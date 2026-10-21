-- O log é histórico (#198): com a FK, excluir em /admin/usuarios quem já tinha
-- logado falhava. A linha fica com o id de quem não existe mais.
alter table log_acoes drop constraint log_acoes_usuario_id_fkey;

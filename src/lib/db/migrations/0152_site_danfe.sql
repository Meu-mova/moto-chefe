-- Site do grupo desenhado na imagem da logo do DANFE (#428). A Consultar Empresa da NG
-- traz endereço, fone e e-mail, mas não site. Vazio = a linha não aparece na imagem.
alter table notagateway_config add column site_danfe text;

-- O login da fábrica virou por loja (0044). A coluna de grupo não tem mais uso e
-- guardar senha em dois lugares só cria divergência.
alter table "grupos" drop column if exists "fabrica_email";
alter table "grupos" drop column if exists "fabrica_senha";

-- Cor da bandeira, para a barra de "grupo ativo" ficar inconfundível e ninguém
-- lançar entrada/saída na empresa errada. Grupo sem cor cai num fallback no código.

alter table grupos add column cor text;

update grupos set cor = 'emerald' where nome ilike '%sul de minas%';
update grupos set cor = 'blue'    where nome ilike '%bh%';
update grupos set cor = 'amber'   where nome ilike '%vale%';

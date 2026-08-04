-- Categorias do calendário viram catálogo editável por grupo, e os eventos ganham
-- início/fim (eventos de vários dias). Eventos já existentes têm a categoria antiga
-- (enum) migrada para o catálogo novo pelo nome, dentro do mesmo grupo.

create table calendario_categorias (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references grupos(id),
  nome       text not null,
  cor        text not null default 'slate',
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
create index calendario_categorias_grupo_idx on calendario_categorias (grupo_id);

-- Seed dos 5 padrões para cada grupo (editáveis/removíveis depois).
insert into calendario_categorias (grupo_id, nome, cor, ordem)
select g.id, v.nome, v.cor, v.ordem
from grupos g
cross join (values
  ('Pagamento',        'rose',  1),
  ('Aniversário',      'pink',  2),
  ('Evento',           'blue',  3),
  ('Ausência de sócio','amber', 4),
  ('Outro',            'slate', 5)
) as v(nome, cor, ordem);

-- Eventos: categoria (enum) -> categoria_id (FK), preservando os eventos já criados.
alter table calendario_eventos add column categoria_id uuid references calendario_categorias(id);

update calendario_eventos e
set categoria_id = c.id
from calendario_categorias c
where c.grupo_id = e.grupo_id
  and c.nome = case e.categoria::text
    when 'pagamento'      then 'Pagamento'
    when 'aniversario'    then 'Aniversário'
    when 'evento'         then 'Evento'
    when 'ausencia_socio' then 'Ausência de sócio'
    else 'Outro'
  end;

alter table calendario_eventos alter column categoria_id set not null;
alter table calendario_eventos drop column categoria;

-- data -> data_inicio + data_fim (eventos de vários dias).
alter table calendario_eventos rename column data to data_inicio;
alter table calendario_eventos add column data_fim date;
update calendario_eventos set data_fim = data_inicio where data_fim is null;
alter table calendario_eventos alter column data_fim set not null;

drop type calendario_categoria;

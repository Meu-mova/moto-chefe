-- Módulo Calendário de gestão. Ver docs/superpowers/specs/2026-08-04-calendario-design.md.
-- Aditivo: só cria tipos e tabelas novos, não toca em nada existente.

create type calendario_categoria    as enum ('pagamento','aniversario','evento','ausencia_socio','outro');
create type calendario_recorrencia  as enum ('nenhuma','anual','mensal');
create type calendario_visibilidade as enum ('grupo','loja','socios','gestao','usuarios');

create table calendario_eventos (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references grupos(id),
  titulo       text not null,
  descricao    text,
  categoria    calendario_categoria    not null,
  data         date not null,
  hora         text,
  recorrencia  calendario_recorrencia  not null default 'nenhuma',
  visibilidade calendario_visibilidade not null,
  loja_id      uuid references lojas(id),
  criado_por   uuid not null references usuarios(id),
  created_at   timestamptz not null default now()
);
create index calendario_eventos_grupo_idx on calendario_eventos (grupo_id, data);

create table calendario_evento_usuarios (
  evento_id  uuid not null references calendario_eventos(id) on delete cascade,
  usuario_id uuid not null references usuarios(id),
  primary key (evento_id, usuario_id)
);

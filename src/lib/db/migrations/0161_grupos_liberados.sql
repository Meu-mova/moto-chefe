-- Grupos de outras Contas liberados pelo admin_geral para um admin_rede (#517). Revogar
-- grava revogado_em e nunca apaga: a linha é o histórico de quem teve acesso e quando.
create table grupos_liberados (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references usuarios(id),
  grupo_id     uuid not null references grupos(id),
  liberado_por uuid not null references usuarios(id),
  liberado_em  timestamptz not null default now(),
  revogado_em  timestamptz
);

-- Uma liberação viva por usuário e grupo.
create unique index grupos_liberados_vivo_key on grupos_liberados (usuario_id, grupo_id) where revogado_em is null;

-- RLS sem policy fecha a tabela para o PostgREST; o app lê e grava pelo Drizzle.
alter table grupos_liberados enable row level security;

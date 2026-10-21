-- Log de acessos e ações sensíveis (ADR-0018 "Log", #198). Guarda 12 meses: a limpeza
-- é o cron /api/cron/log-acoes. Sem antes/depois de cada alteração, de propósito (Q16).

create table log_acoes (
  id          uuid primary key default gen_random_uuid(),
  -- Nula só para quem não é de Conta nenhuma (admin_geral) num login, que ainda não
  -- tem grupo. Quando há grupo, é a Conta do grupo: é por ela que o admin da Conta filtra.
  conta_id    uuid references contas(id),
  grupo_id    uuid references grupos(id),
  usuario_id  uuid not null references usuarios(id),
  -- text + check em vez de enum: valor novo entra num arquivo só (ALTER TYPE ADD VALUE
  -- não pode ser usado na mesma transação).
  tipo        text not null constraint log_acoes_tipo_check
              check (tipo in ('login', 'troca_grupo', 'acesso_dia')),
  detalhe     jsonb,
  ip          text,
  user_agent  text,
  -- Dia em Brasília, só para o acesso_dia valer uma vez por dia.
  dia         date not null,
  criado_em   timestamptz not null default now()
);

create unique index log_acoes_acesso_dia_key on log_acoes (usuario_id, grupo_id, dia)
  where tipo = 'acesso_dia';
create index log_acoes_conta_criado_idx on log_acoes (conta_id, criado_em desc);
create index log_acoes_criado_idx on log_acoes (criado_em);

-- Tem IP e dispositivo de cada pessoa: RLS sem policy fecha a tabela para o
-- PostgREST (anon e authenticated). O app lê e grava pelo Drizzle.
alter table log_acoes enable row level security;

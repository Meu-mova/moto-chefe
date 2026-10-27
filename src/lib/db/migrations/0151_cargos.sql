-- Cargos da Conta (#449, adendo ao ADR-0018): o sócio dá nome e marca os módulos.
create table cargos (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references contas(id),
  nome          text not null,
  modulos       text[] not null default '{}',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Nome único dentro da Conta, sem diferença de maiúscula; outra Conta pode repetir.
create unique index cargos_conta_nome_idx on cargos (conta_id, lower(nome));

alter table usuarios add column cargo_id uuid references cargos(id);
create index usuarios_cargo_id_idx on usuarios (cargo_id);

-- Papel 'cargo' sem cargo daria um usuário sem módulo nenhum; cargo com outro papel, um
-- cargo que não vale.
alter table usuarios add constraint usuarios_cargo_papel_check
  check ((papel = 'cargo') = (cargo_id is not null));

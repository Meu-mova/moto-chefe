-- Papel base do cargo (#616, adendo ao ADR-0018): quem tem o cargo faz o que o papel base faz.
-- Só os papéis que um gestor pode dar a um usuário; admin_geral, admin_rede e cargo ficam de fora.
alter table cargos add column papel_base papel;

-- Cargo gravado antes desta migração não tinha base: recebe a de menor poder.
update cargos set papel_base = 'motorista' where papel_base is null;

alter table cargos alter column papel_base set not null;
alter table cargos add constraint cargos_papel_base_check
  check (papel_base in ('admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista'));

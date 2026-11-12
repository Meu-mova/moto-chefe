-- #834: categorias de despesa e de caixa passam a ser do grupo. Eram uma lista só para todas as
-- Contas: criar, renomear ou reclassificar uma categoria mudava o Financeiro e o DRE de todo mundo.
--
-- Não é tabela nova: só falta o grupo_id, como em beneficiarios_despesa. Nenhuma tabela aponta
-- para estas por FK (despesas, despesas_open_finance e lancamentos_caixa guardam a categoria pelo
-- NOME), então trocar o id na cópia não solta nenhum lançamento.
--
-- Cada grupo existente recebe a lista de hoje (decisão B do #834), e grupo novo começa vazio
-- (decisão A). Chave do nome: despesa (grupo, nome); caixa (grupo, tipo, nome), porque o mesmo
-- nome existe de propósito como entrada e como saída.
--
-- Nome repetido na lista atual: se as cópias têm a mesma classificação, fica uma só. Se discordam,
-- a migração para: escolher uma calada mudaria o Financeiro e o DRE sem ninguém ver.

do $$
declare
  chave text;
begin
  select lower(trim(nome)) into chave
    from categorias_despesa
   group by lower(trim(nome))
  having count(distinct (conta_como_despesa, motivo_nao_operacional, grupo_dre, exige_beneficiario)) > 1
   limit 1;
  if chave is not null then
    raise exception 'categorias_despesa: o nome "%" aparece mais de uma vez com classificação diferente. Deixe uma só antes da 0180.', chave;
  end if;

  select tipo || ' / ' || lower(trim(nome)) into chave
    from categorias_caixa
   group by tipo, lower(trim(nome))
  having count(distinct conta_como_despesa) > 1
   limit 1;
  if chave is not null then
    raise exception 'categorias_caixa: "%" aparece mais de uma vez com classificação diferente. Deixe uma só antes da 0180.', chave;
  end if;
end $$;

-- ─── categorias_despesa ──────────────────────────────────────────────────────
alter table categorias_despesa add column grupo_id uuid references grupos(id) on delete cascade;

insert into categorias_despesa
  (grupo_id, nome, ativo, ordem, conta_como_despesa, motivo_nao_operacional, grupo_dre, exige_beneficiario, criado_em)
select g.id, c.nome, c.ativo, c.ordem, c.conta_como_despesa, c.motivo_nao_operacional, c.grupo_dre, c.exige_beneficiario, c.criado_em
  from (
    select distinct on (lower(trim(nome))) *
      from categorias_despesa
     where grupo_id is null
     order by lower(trim(nome)), ativo desc, ordem, criado_em, id
  ) c
 cross join grupos g;

delete from categorias_despesa where grupo_id is null;
alter table categorias_despesa alter column grupo_id set not null;
-- Começa por grupo_id, então também serve à listagem do grupo: um índice só de grupo_id seria repetido.
create unique index categorias_despesa_grupo_nome_key on categorias_despesa (grupo_id, lower(trim(nome)));

-- ─── categorias_caixa ────────────────────────────────────────────────────────
alter table categorias_caixa add column grupo_id uuid references grupos(id) on delete cascade;

insert into categorias_caixa (grupo_id, nome, tipo, ativo, ordem, conta_como_despesa, criado_em)
select g.id, c.nome, c.tipo, c.ativo, c.ordem, c.conta_como_despesa, c.criado_em
  from (
    select distinct on (tipo, lower(trim(nome))) *
      from categorias_caixa
     where grupo_id is null
     order by tipo, lower(trim(nome)), ativo desc, ordem, criado_em, id
  ) c
 cross join grupos g;

delete from categorias_caixa where grupo_id is null;
alter table categorias_caixa alter column grupo_id set not null;
create unique index categorias_caixa_grupo_tipo_nome_key on categorias_caixa (grupo_id, tipo, lower(trim(nome)));

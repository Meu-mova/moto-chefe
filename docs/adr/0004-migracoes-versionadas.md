# 0004. Migrações SQL à mão, versionadas em `schema_migrations`

- **Status:** Aceita
- **Data da decisão:** 2026-10-01 (executada em 2026-10-06, PR #5)
- **Fontes:** `docs/seguranca/2026-10-01-plano-staging-ci.md` (D2, D4), `scripts/migrate.ts`, `AGENTS.md` ("Banco e migrações")

## Contexto

O journal do Drizzle quebrou na fusão multi-grupo: `db:generate` gera migração tentando
recriar tabelas que já existem. As migrações eram SQL escrito à mão e aplicado sem registro de
qual banco recebeu qual arquivo.

## Decisão

- Migração é SQL à mão em `src/lib/db/migrations/NNNN_nome.sql`; **nunca** `db:generate` nem
  `db:migrate`.
- `scripts/migrate.ts` aplica, em ordem, só o que está pendente:
  - cada arquivo roda numa transação;
  - o que rodou fica registrado em `schema_migrations`, com checksum;
  - editar um arquivo já aplicado trava o próximo `--aplicar`: correção vira arquivo novo.
- Baseline: 0000–0110 registradas como aplicadas, no staging e na produção.
- Produção **só** por `migrate.ts --aplicar --prod`. Nunca pelo MCP do Supabase nem pelo SQL
  Editor: o que entra por fora não é anotado e seria aplicado de novo.
- Previsto, ainda não feito: aplicar sozinho no staging a cada push em `dev` (fase 9).

## Por quê

Saber exatamente o que cada banco tem, e não depender de um journal que não reflete o histórico
real. A trava `--prod` impede rodar na produção sem querer.

## Alternativas descartadas

- **Consertar o journal do Drizzle:** não foi avaliado no plano, que só registra o journal
  quebrado (§2). A avaliação está na issue #20.
- **`apply_migration` do MCP do Supabase:** cria uma trilha paralela (`supabase_migrations`)
  que o `migrate.ts` não enxerga (`docs/infra/staging.md`).

## Situação em 2026-10-07

A fase 9 (D16) está no `.github/workflows/migracoes.yml`: cada PR que mexe em migração passa por
um Postgres descartável, e o push na `dev` aplica no staging. A produção continua manual com
`--prod`. É o único job de CI com credencial de banco (`STAGING_DATABASE_URL`, do staging), e só
roda em push na `dev`, nunca em PR. Detalhes em `docs/infra/staging.md` ("Migrações").

## Quando revisar

Quando a issue #20 concluir (o `drizzle-kit generate` pode virar gerador de rascunho, sem
deixar de aplicar pelo `migrate.ts`), ou se a migração no CI (fase 9) mudar o fluxo.

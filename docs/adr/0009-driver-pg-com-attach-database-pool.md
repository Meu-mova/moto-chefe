# 0009. Driver `pg` com `attachDatabasePool`

- **Status:** Aceita
- **Data da decisão:** 2026-08-05 (commit `aff582a`)
- **Fontes:** commit `aff582a`, `src/lib/db/index.ts`, `AGENTS.md` ("Banco e migrações")

## Contexto

`/folha` e `/estoque` travavam em produção. As conexões do `postgres.js` ficavam presas em
`active/ClientRead` quando a instância do Fluid Compute da Vercel suspendia, segurando o pooler
do Supabase (consultas presas por 84–99 s em `pg_stat_activity`). Pelo `AGENTS.md`, a
configuração do pool já derrubou essas telas três vezes.

## Decisão

- Pool principal com o driver **`pg`** (node-postgres) e o **`attachDatabasePool`** de
  `@vercel/functions`, que libera as conexões antes de a instância suspender.
- `max: 10`, sobre o pooler Supavisor em transaction mode (porta 6543).
- O `postgres.js` fica só para o Jarvis.
- **Não mexer** em `src/lib/db/index.ts` sem plano próprio.

## Por quê

É a correção oficial da Vercel para esse congelamento, e o `attachDatabasePool` só suporta o
`pg`. O descompasso de tipo do `db.execute()` (devolve `{ rows }` em runtime) é resolvido pelo
helper `execRows()`.

## Alternativas descartadas

- **Desligar o Fluid Compute (`fluid: false` no `vercel.json`):** quebra o deploy (`aff582a`).
- **Endurecer o pool do `postgres.js` (`max_lifetime`):** tentado em `fb1ed6e` (2026-08-04);
  a correção da causa veio no dia seguinte, em `aff582a`.

## Quando revisar

Se a hospedagem sair da Vercel: o `attachDatabasePool` é específico dela.

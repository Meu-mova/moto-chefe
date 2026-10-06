# Runbook — staging (`mova-staging`)

Banco de staging do MOVA: projeto Supabase separado da produção, com o mesmo schema `public` e
**nenhum dado real** (D3 do plano; dado só por seed sintético). Plano completo:
`docs/seguranca/2026-10-01-plano-staging-ci.md`.

| | |
|---|---|
| Projeto | `mova-staging`, ref `pulsqeymzsheasxsdnnk` |
| Org / plano | "Motochefe Sul de Minas" (Pro), compute Micro (~US$ 10/mês, por hora) |
| Região / Postgres | `sa-east-1` (São Paulo) / 17.x |
| Schema | `supabase/schema-baseline.sql` (dump do `public` da prod, congelado em 2026-10-05) |
| Buckets | `supabase/staging-buckets.sql` (`assinaturas`, `comprovantes`, `holerites` privados; `modelos` público) |
| Fora | schema `crm` (outro sistema que vive na prod; decisão de 05/10) |

## Acesso

- **Conexão local:** `.env.staging.local` (ignorado pelo git) com só `DATABASE_URL` do
  **Session pooler** (`postgres.pulsqeymzsheasxsdnnk@aws-…-sa-east-1.pooler.supabase.com:5432`).
  No painel: **Connect → Direct (Connection string) → Session pooler**. Senha esquecida:
  **Project Settings → Database → Reset database password**.
- Nunca imprima o conteúdo do arquivo nem a URL, nem em mensagem de erro.
- **MCP `supabase-staging`** (Claude Code, escopo local) está preso a
  `?project_ref=pulsqeymzsheasxsdnnk` e não alcança a prod. Leitura e `get_advisors` funcionam;
  DDL pelo `execute_sql` é barrado pelo auto mode, então DDL vai por `psql` (abaixo).
  Não use `apply_migration`: grava em `supabase_migrations` e cria trilha paralela ao `migrate.ts` (D4).

## Criar do zero

1. Novo projeto na org Pro: nome `mova-staging`, região **São Paulo** (Advanced configuration),
   Postgres 17. Marque **Data API**, **Automatically expose new tables** (reproduz os grants de
   `anon`/`authenticated` da prod, porque o dump sai sem privilégios) e **Enable automatic RLS**
   (cria o event trigger `ensure_rls`, o mesmo da prod). **Integração GitHub do Supabase:
   desligada.**
2. Preencha `.env.staging.local` como em [Acesso](#acesso).
3. Aplique (o baseline vai numa transação só: ou entra tudo, ou nada):
   ```bash
   set -a; source .env.staging.local; set +a
   psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -1 -f supabase/schema-baseline.sql
   psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f supabase/staging-buckets.sql
   ```
   O projeto novo já traz `public.rls_auto_enable()`; por isso o baseline usa `CREATE OR REPLACE`
   nessa função.
4. Confira (valores de 2026-10-05, iguais aos da prod):
   ```sql
   select
    (select count(*) from pg_tables where schemaname='public') tabelas,                    -- 84
    (select count(*) from pg_tables where schemaname='public' and rowsecurity) com_rls,   -- 84
    (select count(*) from pg_views where schemaname='public') views,                      -- 1
    (select count(*) from pg_sequences where schemaname='public') sequences,              -- 2
    (select count(*) from pg_type t where t.typnamespace='public'::regnamespace and t.typtype='e') enums, -- 20
    (select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='f') fks,  -- 164
    (select count(*) from pg_policies where schemaname='public') policies,                -- 31
    (select count(*) from pg_proc where pronamespace='public'::regnamespace) funcoes,     -- 18
    (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosecdef) secdef, -- 17
    (select count(*) from storage.buckets) buckets,                                       -- 4
    (select count(distinct table_name) from information_schema.role_table_grants
      where table_schema='public' and grantee='anon') grants_anon;                        -- 85
   ```
   Trigger esperado: só `trg_set_venda_numero` em `vendas`.
5. `get_advisors` (segurança) deve mostrar os mesmos problemas da prod (Etapa 1): 71 tabelas com
   RLS sem policy, view `vendas_seguras` SECURITY DEFINER, 17 funções sem `search_path`,
   17 funções SECURITY DEFINER executáveis por `anon`/`authenticated`. Não corrija no staging
   à parte: a correção é testada aqui e vai à prod como migração.

6. Registre o baseline de migrações (cria `public.schema_migrations` e marca 0000–0110 como
   aplicadas, porque o baseline já as contém):
   ```bash
   npx dotenv-cli -e .env.staging.local -- node --import tsx scripts/migrate.ts --baseline-ate 110
   npx dotenv-cli -e .env.staging.local -- node --import tsx scripts/migrate.ts --status   # "Nada pendente."
   ```
   Depois disso a contagem de tabelas do passo 4 vira 85 (a `schema_migrations`, com RLS e sem
   grant para `anon`/`authenticated`). Se houver migração acima de 0110 no repo, rode `--aplicar`.

## Migrações

Fluxo completo no `AGENTS.md` ("Banco e migrações"). Resumo: arquivo novo em
`src/lib/db/migrations/` → `migrate.ts --aplicar` aqui → conferir → `migrate.ts --aplicar --prod`.
Antes de cada PR `dev → main`, rode `scripts/schema-diff.sh`: compara o `public` daqui com o da
prod e sai com erro se forem diferentes.

## Recriar

Não testado. O caminho mais limpo é apagar o projeto e refazer [Criar do zero](#criar-do-zero).
O ref muda: atualize o MCP `supabase-staging` (`~/.claude.json`), o `.env.staging.local`, este
runbook e as variáveis Preview da Vercel (fase 6).

## Pausa

Projeto em org Pro não pausa por inatividade (diferente do Free previsto na D1).

## Ainda não existe

- `schema_migrations` na produção: aguarda o OK do Cesar (`--baseline-ate` com `--prod`).
  Até lá, migração na prod vai por `sql.ts --file ... --prod` e precisa ser aplicada aqui
  também pelo `migrate.ts`.
- Seed sintético (`scripts/seed-staging.ts`) e usuários de teste: fase 5.

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

- **Conexão local:** `.env.local` (ignorado pelo git), com as variáveis do staging; a
  `DATABASE_URL` é a do **Session pooler** (`postgres.pulsqeymzsheasxsdnnk@aws-…-sa-east-1.pooler.supabase.com:5432`).
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
2. Preencha o `.env.local` como em [Acesso](#acesso).
3. Aplique (o baseline vai numa transação só: ou entra tudo, ou nada):
   ```bash
   set -a; source .env.local; set +a
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
   npx dotenv-cli -e .env.local -- node --import tsx scripts/migrate.ts --baseline-ate 110
   npx dotenv-cli -e .env.local -- node --import tsx scripts/migrate.ts --status   # "Nada pendente."
   ```
   Depois disso, no passo 4, `tabelas` e `com_rls` viram 85 (a `schema_migrations`, com RLS);
   `grants_anon` continua 85, porque ela não tem grant para `anon`/`authenticated`. Se houver migração acima de 0110 no repo, rode `--aplicar`.

## Migrações

Fluxo completo no `AGENTS.md` ("Banco e migrações"). Resumo: arquivo novo em
`src/lib/db/migrations/` → `migrate.ts --aplicar` aqui → conferir → `migrate.ts --aplicar --prod`.
Staging e produção têm `schema_migrations` com baseline até 0110 (registrado em 2026-10-06, com
OK do Cesar). Antes de cada PR `dev → main`, rode
`node --import tsx scripts/schema-diff.ts .env.local .env.prod.local`: compara o
`public` daqui com o da prod e sai com erro se forem diferentes. Ele confere que o primeiro env
é o staging e o segundo é a produção, e recusa se não forem.

## Dados de teste (seed)

`scripts/seed-staging.ts` apaga e recria o conjunto sintético: esvazia todas as tabelas do
`public` (menos `schema_migrations`) e os usuários `@teste.meumova.com` do Auth. Só roda se banco
**e** Auth forem o `mova-staging` (lista de permissão no código; nenhuma flag libera outro projeto).

```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/seed-staging.ts
```

Precisa no `.env.local`: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (painel → Project Settings → API Keys) e `SEED_SENHA` (senha única
de todos os usuários de teste; guardada no Bitwarden).

O que cria (dados em `scripts/lib/seed-dados.ts`): 3 grupos e 8 lojas fictícios, 16 usuários
(`geral@`, e por grupo `socio.`, `aux.`, `vendedor.`, `mecanico.`, `motorista.` + `sul|bh|vale`),
6 modelos do catálogo com preço mínimo e taxas por grupo, 32 motos, 4 reservas ativas, 8 vendas
e 5 OS. Só o `socio.*` aprova transferência; o `aux.*` cai no pedido de aprovação.

Reservas para testar a finalização com aprovação. Ficam nas lojas principais de cada grupo,
que é onde os usuários de teste estão: quem não é admin só vê "Finalizar Venda" na própria loja.

| Loja | Login | Cenário |
|---|---|---|
| Teste Sul Centro | `aux.sul@` | total abaixo do mínimo, entrada em PIX → aprovação de valor mínimo |
| Teste Sul Centro | `aux.sul@` | entrada por transferência, acima do mínimo → aprovação de pagamento sensível |
| Teste BH Centro | `aux.bh@` | acima do mínimo, PIX → finaliza direto |
| Teste Vale Centro | `aux.vale@` | abaixo do mínimo e por transferência → aprovação de pagamento sensível (a tela checa transferência primeiro) |

Quem aprova: `socio.<grupo>@` (valor mínimo e transferência). `geral@` aprova valor mínimo em
qualquer grupo, mas não transferência.

## Rodar o app contra o staging

```bash
npm run dev:staging            # http://localhost:3000; argumentos extras vão para o next dev
```

O `npm run dev` já lê o `.env.local`, que é o staging. O `dev:staging` (`scripts/dev-staging.ts`)
acrescenta duas travas: só sobe se banco e Supabase do `.env.local` forem o `mova-staging`, e lê
os outros `.env` (`.env`, `.env.development` e afins) com o próprio carregador do Next
(`@next/env`), definindo como vazia toda chave que eles têm e o `.env.local` não. Sem isso, um
desses arquivos esquecido com valor da produção (Open Finance, Resend, Bling, `CERT_MASTER_KEY`)
entraria no app de staging, porque o Next preenche toda chave que ainda não existe. O Next não
sobrescreve chave já definida, e o app trata vazio como "não configurado" (exceção: usos com `??` em `bling.ts` e
`kommo.ts`, integrações que não funcionam no staging). Ele lista os nomes anulados ao subir.

Porta diferente de 3000 (`npm run dev:staging -- --port 3001`) exige mudar `MOVA_URL` e
`NEXT_PUBLIC_APP_URL` no `.env.local`; senão os links gerados apontam para a 3000.

O `.env.local` para o app precisa, além do que o seed usa: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(publishable key do staging), `CERT_MASTER_KEY` e `CRON_SECRET` (próprias do staging, geradas
localmente; não são as da prod; a `CERT_MASTER_KEY` tem de ser a mesma em toda máquina, porque
uma nova não decifra o que já está cifrado no banco), `MOVA_URL` e `NEXT_PUBLIC_APP_URL` (`http://localhost:3000`). É o
bloco "Mínimo" do [`.env.example`](../../.env.example).
Nenhuma credencial de integração vem do env no staging: Open Finance, Bling, Kommo e WhatsApp ficam
desligados. Pela D7, Nota Gateway em homologação se configura por grupo em `/admin/notas-fiscais`
do próprio staging (fica no banco, cifrada com a `CERT_MASTER_KEY` do staging), e o Resend entra em
modo de teste quando for preciso.

## Recriar

Não testado. O caminho mais limpo é apagar o projeto e refazer [Criar do zero](#criar-do-zero).
O ref muda: atualize o MCP `supabase-staging` (`~/.claude.json`), o `.env.local`, este runbook e
as variáveis Preview da Vercel (fase 6).

## Pausa

Projeto em org Pro não pausa por inatividade (diferente do Free previsto na D1).

## Ainda não existe


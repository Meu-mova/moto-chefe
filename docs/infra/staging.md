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
`src/lib/db/migrations/` → PR (o CI valida num Postgres descartável) → merge na `dev` (o CI
aplica aqui) → conferir → `migrate.ts --aplicar --prod`.

O workflow é o `.github/workflows/migracoes.yml`:
- **`validar`** (PR para `dev`/`main` e push na `dev`, só quando mexe em migração, `supabase/`,
  `migrate.ts`, `scripts/lib/`, `package.json`, `package-lock.json`, `.nvmrc` ou no próprio
  workflow): Postgres 17 puro + `supabase/ci-stubs.sql` (papéis do
  Supabase e `auth.uid()`) + baseline + `migrate.ts`. Migração que mexa em `storage.*` ou em
  tabelas do `auth` falha aqui até o stub ganhar o que ela usa.
- **`aplicar-staging`** (só push na `dev`): `migrate.ts --aplicar --exigir-staging` com o secret
  `STAGING_DATABASE_URL` (Session pooler). O `--exigir-staging` recusa qualquer banco que não
  seja o `mova-staging`.

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
(publishable key do staging), `CERT_MASTER_KEY` e `CRON_SECRET` (próprias do staging, no
Bitwarden; não são as da prod; a `CERT_MASTER_KEY` tem de ser a mesma em toda máquina, porque
uma nova não decifra o que já está cifrado no banco), `MOVA_URL` e `NEXT_PUBLIC_APP_URL` (`http://localhost:3000`). É o
bloco "Mínimo" do [`.env.example`](../../.env.example).
Nenhuma credencial de integração vem do env no staging: Open Finance, Bling, Kommo e WhatsApp ficam
desligados. Pela D7, Nota Gateway em homologação se configura por grupo em `/admin/notas-fiscais`
do próprio staging (fica no banco, cifrada com a `CERT_MASTER_KEY` do staging), e o Resend entra em
modo de teste quando for preciso.

## Nota Gateway em homologação

Para testar emissão e cancelamento de NF-e, o "Grupo Teste Sul" usa a empresa de teste da Nota
Gateway (CNPJ da própria Nota Gateway, de MG, regime normal), em homologação. A chave é a da conta
da Nota Gateway, a mesma da produção (exceção registrada no ADR-0005): ela entra só pela tela, nunca
por chat, arquivo ou commit.

1. `npm run dev:staging` e entrar como `geral@teste.meumova.com`.
2. Em `/admin/notas-fiscais`, no "Grupo Teste Sul": digitar a chave e escolher **Homologação**. A
   tela não grava o `empresaId`, que vem do cadastro da empresa na API.
3. Gravar o `empresaId` da empresa de teste. O ID fica fora do git; quem opera a Nota Gateway tem.
   É escrita no banco do staging:
   ```bash
   npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "update notagateway_config set empresa_id = '<id>' where grupo_id = (select id from grupos where nome = 'Grupo Teste Sul')"
   ```
4. Na mesma tela, a regra fiscal de saída que a empresa de teste aceita: CFOP 5102 (6102 fora da
   UF), CST do ICMS 41, PIS e COFINS 49, IBS/CBS 000 com classificação 000001, CRT 3 (regime
   normal). CSOSN, como 102, volta a recusa 591.
5. A venda a emitir precisa do endereço completo do cliente (editar venda) e da ficha fiscal da moto
   (o painel de emissão pede). Contrato não assinado se libera com motivo, por admin.

- Ambiente sempre em homologação: fora do app de produção, a trava em
  `src/lib/notagateway/ambiente.ts` recusa `Producao`.
- Sem webhook na Nota Gateway: o cadastro vale para a conta inteira, e os eventos da produção
  viriam para o staging.
- Para desligar, apague a linha do grupo em `notagateway_config`.

## App na Vercel (Preview)

Desde 2026-10-07, o ambiente **Preview** do projeto `mova-motochefe` (time MOVA) é o staging: cada
PR e a branch `dev` sobem com ele (D6 do plano).

| Variável (Preview) | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | do `mova-staging` |
| `DATABASE_URL` | do `mova-staging`, pooler em **transaction mode (6543)**, como o app espera na Vercel; o `.env.local` usa o Session pooler (5432) |
| `CERT_MASTER_KEY`, `CRON_SECRET` | as do staging (Bitwarden) |
| `MOVA_URL`, `NEXT_PUBLIC_APP_URL` | sem valor. Fora de produção, o link de assinatura usa sempre o host do deployment (`VERCEL_URL`, `src/lib/assinatura/url.ts`), mesmo com elas definidas |
| Credenciais de integração (Resend, WhatsApp, Telegram, Jarvis, Bling, fábrica, ValidaPix) | nenhuma: ficaram só em Production (D7) |

- **Domínio:** `dev.meumova.com` → branch `dev`. A zona DNS do `meumova.com` fica na conta
  pessoal do Cesar na Vercel, não no time MOVA; a posse foi provada com o TXT
  `_vercel.meumova.com` criado lá.
- **Proteção:** Vercel Authentication (Standard Protection) em todos os previews, inclusive o
  `dev.meumova.com`: quem entra passa pelo login da Vercel, como membro do time MOVA, e depois
  pelo do MOVA. A D6 previa desligar; **mantida por decisão do Luis em 2026-10-07**. Para
  testar por linha de comando: `vercel curl <caminho> --deployment <url>`.
- **Diferenças da §5.5 do plano:** a URL do app não foi fixada em `https://dev.meumova.com` (ver a
  tabela), e `EMAIL_FROM`, `LEADS_EMAIL_TO` e `DEFAULT_USER_PASSWORD` não foram definidas no
  Preview: e-mail fica desligado (D7) e a senha dos usuários sintéticos é a `SEED_SENHA` do seed.
- **Link de assinatura em preview:** aponta para o host `*.vercel.app` do deployment, que fica
  atrás da proteção da Vercel; quem não é do time não abre.
- **Conferir:** `vercel curl /assinar/token-falso --deployment <url>` responde 404 (app e banco
  no ar) e `/dashboard` redireciona para `/login`.

## Smoke

O workflow `Smoke do preview` (`.github/workflows/smoke.yml`, fase 10, D17) roda quando a Vercel
marca um preview como pronto (evento `deployment_status`; Production fica de fora). O
`scripts/smoke.ts` entra com dois usuários do seed e visita as telas:

| Usuário | Telas |
|---|---|
| `aux.sul@teste.meumova.com` (aux_adm) | `/dashboard`, `/estoque`, `/vendas`, `/ordens-servico`, `/conciliacao` |
| `geral@teste.meumova.com` (admin_geral) | as cinco acima, `/folha-pagamento`, `/financeiro`, `/admin/notas-fiscais` |

Uma tela falha com status 5xx, redirecionamento (inclusive para `/login`), erro no console do
navegador, exceção na página ou resposta 5xx de requisição do próprio app. Só navega: não
preenche nem confirma formulário. As regras estão em `scripts/lib/smoke.ts`.

- **Secrets:** `SMOKE_SENHA` (a `SEED_SENHA`) e `VERCEL_AUTOMATION_BYPASS_SECRET` (o header
  `x-vercel-protection-bypass` deixa o robô passar pela proteção, que segue ligada para o resto).
- **Rodar à mão** contra o app local (`npm run dev:staging`), sem bypass:
  `SMOKE_URL=http://localhost:3000 SMOKE_SENHA=<senha do seed> node --import tsx scripts/smoke.ts`.
- Se o seed mudar os usuários ou o primeiro acesso deles (`/completar-cadastro`,
  `/trocar-senha`), o smoke falha no login.

## Recriar

Não testado. O caminho mais limpo é apagar o projeto e refazer [Criar do zero](#criar-do-zero).
O ref muda: atualize o MCP `supabase-staging` (`~/.claude.json`), o `.env.local`, este runbook e
as variáveis Preview da Vercel ([App na Vercel](#app-na-vercel-preview)).

## Pausa

Projeto em org Pro não pausa por inatividade (diferente do Free previsto na D1).

## Ainda não existe


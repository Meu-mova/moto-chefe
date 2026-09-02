# CRM no MOVA — Fase 1 (teste em paralelo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ter o CRM "Elite da IA" rodando dentro do MOVA em `/crm` (atrás de flag), com login único, dados isolados no schema `crm`, e o motor (WhatsApp 1:1 / automações / agente) rodando num container separado — para teste em paralelo, sem tocar no Kommo.

**Architecture:** Abordagem A. O app MOVA no Vercel serve as telas `/crm` (supabase-js sobre o schema `crm`, com RLS) e o webhook de mensagens (persiste rápido). Um container sempre-ligado roda os workers de fundo do template (automações, recuperação, agente) e hospeda a Evolution API. Tudo no MESMO projeto Supabase do MOVA — o `auth.users` compartilhado dá o SSO; as tabelas do CRM vivem num schema `crm` isolado do `public` do MOVA.

**Tech Stack:** Next.js 16 (App Router, React 19), Supabase (Postgres + Auth + pgvector), `@supabase/ssr` + supabase-js, Vercel AI SDK v6 (Anthropic chat + OpenAI embeddings), Evolution API (WhatsApp não-oficial), Docker (container do motor). Migrations via `scripts/sql.ts` (SQL manual, NUNCA drizzle-kit).

**Spec:** `docs/superpowers/specs/2026-09-02-crm-integracao-fase1-design.md`

## Global Constraints

- **Idioma:** todo código, comentário e UI em **português (BR)**.
- **Migrations:** aplicar SQL manual via `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file <arq.sql>` (caminho relativo a `src/lib/db/migrations`). **NUNCA** `db:generate`/`db:migrate` (journal do drizzle-kit quebrado).
- **Isolamento de schema:** nenhum objeto do CRM no schema `public`; tudo em `crm`. Nenhuma query do MOVA (Drizzle) referencia `crm`; nenhuma query do CRM referencia tabelas do MOVA. Reverter = `drop schema crm cascade`.
- **Segredos só em env** (Supabase service role, Evolution apiKey, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), nos dois runtimes. Nada versionado. Service-role key jamais no cliente/browser.
- **Flag primeiro:** `/crm` nasce invisível; só aparece para quem for liberado (começa nos sócios), pelo mecanismo de navegação do MOVA (`src/lib/navegacao.ts` + `modulosExtras`/`papeis`).
- **Fora da fase 1:** aposentar Kommo, WhatsApp em grupo, ponte de dados reais, mapeamento grupo↔org, billing.
- **Template de origem:** `D:\Claude\template_crm_agentes-main\template_crm_agentes-main` (só leitura; nunca modificar). Destino: `D:\Claude\Teste`.
- **Rodar suíte MOVA** (`npm test`) verde ao fim de cada tarefa que toca `src/`; **build** (`npm run build`) verde ao fim de cada marco.

---

## Estrutura de arquivos (o que cada peça faz)

- `src/lib/db/migrations/0083_crm_schema_baseline.sql` — cria o schema `crm`, extensions e helpers de RLS namespaceados.
- `src/lib/db/migrations/0084_crm_template.sql` — as ~50 migrations do template consolidadas e reescritas para o schema `crm`.
- `src/lib/crm/supabase/{server,browser,service}.ts` — clientes supabase-js fixados em `db.schema='crm'` (reusam a sessão do MOVA).
- `src/lib/crm/tipos.ts` — tipos gerados do Supabase para o schema `crm` (`Database`).
- `src/lib/crm/org.ts` — org de teste + provisionamento de `profile`/`membership` no 1º acesso.
- `src/lib/crm/**` — porte do `lib/` do template (messaging, automations, agent, llm).
- `src/app/(dashboard)/crm/**` — telas do CRM (porte de `app/(app)/app/[orgSlug]/**`, org fixada).
- `src/app/api/crm/webhooks/messaging/[provider]/route.ts` — webhook (persiste rápido).
- `worker/` (novo, na raiz) — entrypoint do container (loops de fundo) + `Dockerfile`.
- `src/lib/navegacao.ts` — item `/crm` atrás de flag.

---

## MARCO 0 — Fundação de dados (schema `crm`)

### Task 1: Schema `crm` + helpers de RLS

**Files:**
- Create: `src/lib/db/migrations/0083_crm_schema_baseline.sql`
- Test (verificação): consulta SQL via `scripts/sql.ts`

**Interfaces:**
- Produces: schema `crm`; funções `crm.is_org_member(uuid)` e `crm.has_org_role(uuid, text[])` (SECURITY DEFINER, `set row_security = off`), extensão `vector` disponível.

- [ ] **Step 1: Escrever a migration baseline**

Criar `0083_crm_schema_baseline.sql`:
```sql
-- Schema isolado do CRM (template Elite da IA). Nada aqui encosta no public do MOVA.
create schema if not exists crm;
create extension if not exists vector;      -- global; RAG do agente
-- Helpers de RLS namespaceados (equivalente aos do template, agora em crm).
create or replace function crm.is_org_member(p_org uuid)
returns boolean language sql stable security definer set row_security = off as $$
  select exists (select 1 from crm.memberships m
                 where m.organization_id = p_org and m.user_id = auth.uid());
$$;
create or replace function crm.has_org_role(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set row_security = off as $$
  select exists (select 1 from crm.memberships m
                 where m.organization_id = p_org and m.user_id = auth.uid()
                   and m.role = any(p_roles));
$$;
```
(Nota: `memberships` é criada na Task 2; as funções só são *chamadas* pelas policies de lá, então criá-las antes é ok — Postgres resolve o corpo na execução.)

- [ ] **Step 2: Aplicar e verificar que o schema existe**

Run:
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0083_crm_schema_baseline.sql
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select nspname from pg_namespace where nspname='crm'"
```
Expected: retorna uma linha `{ "nspname": "crm" }`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/migrations/0083_crm_schema_baseline.sql
git commit -m "feat(crm): schema crm isolado + helpers de RLS (fase 1)"
```

---

### Task 2: Portar as migrations do template para o schema `crm`

**Files:**
- Create: `src/lib/db/migrations/0084_crm_template.sql`
- Read (origem, só leitura): `D:\Claude\template_crm_agentes-main\template_crm_agentes-main\supabase\migrations\*.sql`
- Test (verificação): contagem de tabelas em `crm`

**Interfaces:**
- Produces: ~33 tabelas em `crm` (`organizations`, `memberships`, `profiles`, `invitations`, `contacts`, `companies`, `deals`, `deal_contacts`, `tasks`, tags, `channels`, `conversations`, `messages`, `whatsapp_templates`, `agents`, `agent_faq_items`, `agent_documents`, `agent_document_chunks`, `agent_runs`, `agent_usage_daily`, `automations`, `automation_runs`, `automation_run_steps`, …) com RLS ativa; RPCs (`create_organization_with_owner`, `agent_search_kb`, `consume_agent_tokens`) em `crm`.

- [ ] **Step 1: Consolidar e reescrever as migrations para `crm`**

Ler todas as migrations do template em ordem cronológica e gerar UM arquivo `0084_crm_template.sql` com estas transformações mecânicas:
- Prefixar toda referência de tabela/tipo/função própria com `crm.` (ex.: `create table contacts` → `create table crm.contacts`; `references organizations` → `references crm.organizations`).
- Trocar chamadas aos helpers `is_org_member(...)`/`has_org_role(...)` por `crm.is_org_member(...)`/`crm.has_org_role(...)` (já criados na Task 1 — **não** recriar).
- Manter `auth.uid()`, `auth.users` e `vector` como estão (schemas globais).
- Enums (`org_role`, etc.): criar em `crm` (`create type crm.org_role as enum ('owner','admin','member')`).
- Índices HNSW/pgvector: manter, qualificando a tabela.

- [ ] **Step 2: Aplicar contra um Supabase de staging/branch primeiro**

Run (usar a branch/projeto de staging se houver; senão o mesmo, já que `crm` é isolado):
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0084_crm_template.sql
```
Expected: `OK — sem linhas de retorno` (o lote é transacional: ou aplica tudo, ou nada).

- [ ] **Step 3: Verificar a contagem de tabelas e a RLS**

Run:
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select count(*)::int as tabelas from information_schema.tables where table_schema='crm'"
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select count(*)::int as com_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='crm' and c.relrowsecurity"
```
Expected: `tabelas` ~33 (>= 30); `com_rls` > 0 (a maioria das tabelas com RLS ligada).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/migrations/0084_crm_template.sql
git commit -m "feat(crm): tabelas do template portadas para o schema crm"
```

---

## MARCO 1 — Login e tenancy

### Task 3: Clientes supabase-js fixados no schema `crm`

**Files:**
- Create: `src/lib/crm/supabase/server.ts`, `src/lib/crm/supabase/service.ts`, `src/lib/crm/supabase/browser.ts`
- Create: `src/lib/crm/tipos.ts` (tipos gerados)
- Test: `src/lib/crm/supabase/server.test.ts`

**Interfaces:**
- Consumes: `@/lib/supabase/server` (padrão de cookies/SSR do MOVA).
- Produces:
  - `crmServer(): Promise<SupabaseClient<Database, 'crm'>>` — cliente com sessão do usuário (RLS aplicada).
  - `crmService(): SupabaseClient<Database, 'crm'>` — cliente service-role (ignora RLS; só server/worker).
  - `crmBrowser(): SupabaseClient<Database, 'crm'>` — cliente do browser (RLS).

- [ ] **Step 1: Gerar os tipos do schema `crm`**

Run (gera os tipos e salva):
```bash
npx dotenv-cli -e .env.local -- npx supabase gen types typescript --project-id <PROJECT_ID> --schema crm > src/lib/crm/tipos.ts
```
(Se o CLI do Supabase não autenticar — ver memória — copiar `types/supabase.ts` do template e podar para o schema `crm`.)

- [ ] **Step 2: Escrever o teste do cliente server (schema fixado)**

`src/lib/crm/supabase/server.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crmService } from './service'

test('crmService aponta para o schema crm', async () => {
  const c = crmService()
  // o supabase-js expõe o schema configurado; uma query trivial não deve estourar
  const { error } = await c.from('organizations').select('id').limit(1)
  assert.equal(error, null)
})
```

- [ ] **Step 3: Rodar o teste (falha: módulo não existe)**

Run: `npx dotenv-cli -e .env.local -- node --import tsx --test src/lib/crm/supabase/server.test.ts`
Expected: FAIL (`Cannot find module './service'`).

- [ ] **Step 4: Implementar os três clientes**

`src/lib/crm/supabase/service.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/crm/tipos'

// Service-role: ignora RLS. SÓ server/worker. Fixado no schema crm.
export function crmService(): SupabaseClient<Database, 'crm'> {
  return createClient<Database, 'crm'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'crm' }, auth: { persistSession: false } },
  )
}
```
`src/lib/crm/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/crm/tipos'

// Sessão do usuário (mesma do MOVA) + schema crm → RLS aplicada.
export async function crmServer(): Promise<SupabaseClient<Database, 'crm'>> {
  const jar = await cookies()
  return createServerClient<Database, 'crm'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'crm' },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    },
  )
}
```
`src/lib/crm/supabase/browser.ts`:
```ts
'use client'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/crm/tipos'

export function crmBrowser(): SupabaseClient<Database, 'crm'> {
  return createBrowserClient<Database, 'crm'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'crm' } },
  )
}
```

- [ ] **Step 5: Rodar o teste (passa)**

Run: `npx dotenv-cli -e .env.local -- node --import tsx --test src/lib/crm/supabase/server.test.ts`
Expected: PASS.

- [ ] **Step 6: Adicionar o teste à suíte e commitar**

Adicionar `src/lib/crm/supabase/server.test.ts` à lista de arquivos do script `test` em `package.json`.
```bash
git add src/lib/crm/supabase/ src/lib/crm/tipos.ts package.json
git commit -m "feat(crm): clientes supabase-js fixados no schema crm"
```

---

### Task 4: Org de teste + provisionamento de membership no 1º acesso

**Files:**
- Create: `src/lib/crm/org.ts`
- Test: `src/lib/crm/org.test.ts`

**Interfaces:**
- Consumes: `crmService` (Task 3).
- Produces:
  - `ORG_TESTE_SLUG = 'mova-teste'`
  - `garantirOrgTeste(): Promise<string>` — cria (idempotente) a org de teste, retorna seu `id`.
  - `garantirMembership(userId: string): Promise<void>` — upsert de `profiles` + `memberships` do usuário na org de teste (papel `member`).

- [ ] **Step 1: Escrever o teste (idempotência)**

`src/lib/crm/org.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { garantirOrgTeste } from './org'

test('garantirOrgTeste é idempotente (mesma org id nas duas chamadas)', async () => {
  const a = await garantirOrgTeste()
  const b = await garantirOrgTeste()
  assert.ok(a)
  assert.equal(a, b)
})
```

- [ ] **Step 2: Rodar (falha)**

Run: `npx dotenv-cli -e .env.local -- node --import tsx --test src/lib/crm/org.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`src/lib/crm/org.ts`:
```ts
import { crmService } from './supabase/service'

export const ORG_TESTE_SLUG = 'mova-teste'

export async function garantirOrgTeste(): Promise<string> {
  const db = crmService()
  const achada = await db.from('organizations').select('id').eq('slug', ORG_TESTE_SLUG).maybeSingle()
  if (achada.data?.id) return achada.data.id
  const criada = await db.from('organizations')
    .insert({ slug: ORG_TESTE_SLUG, name: 'MOVA — Teste' })
    .select('id').single()
  if (criada.error) throw criada.error
  return criada.data.id
}

// Chamada no 1º acesso a /crm: garante profile + membership do usuário logado.
export async function garantirMembership(userId: string): Promise<void> {
  const db = crmService()
  const orgId = await garantirOrgTeste()
  await db.from('profiles').upsert({ id: userId }, { onConflict: 'id' })
  await db.from('memberships').upsert(
    { organization_id: orgId, user_id: userId, role: 'member' },
    { onConflict: 'organization_id,user_id' },
  )
}
```
(Ajustar nomes de colunas de `profiles`/`memberships` conforme os tipos gerados na Task 3.)

- [ ] **Step 4: Rodar (passa)**

Run: `npx dotenv-cli -e .env.local -- node --import tsx --test src/lib/crm/org.test.ts`
Expected: PASS (e a org `mova-teste` existe no banco).

- [ ] **Step 5: Adicionar à suíte + commit**

```bash
git add src/lib/crm/org.ts src/lib/crm/org.test.ts package.json
git commit -m "feat(crm): org de teste unica + provisionamento de membership"
```

---

## MARCO 2 — Telas do CRM sob flag

### Task 5: Flag + item de navegação `/crm`

**Files:**
- Modify: `src/lib/navegacao.ts` (import de ícone + item na categoria `comercial`)
- Modify: `src/lib/navegacao.test.ts` (expectativas)

**Interfaces:**
- Produces: item de nav `{ id: 'crm', href: '/crm', categoria: 'comercial', papeis: [], regraPropria: true }` — **invisível por padrão**, liberado por pessoa via `modulosExtras` (mesmo mecanismo do item `entrada`).

- [ ] **Step 1: Adicionar o item (invisível: `papeis: []` + `regraPropria`)**

Em `src/lib/navegacao.ts`, importar um ícone (`MessagesSquare`) e adicionar na seção Comercial:
```ts
{ id: 'crm', href: '/crm', label: 'CRM', icon: MessagesSquare, categoria: 'comercial', papeis: [], regraPropria: true },
```
(Como `entrada`: `regraPropria` faz a visibilidade sair de `RegrasProprias[id]`, não da tabela de papéis. Assim `/crm` só aparece para quem tiver o id em `modulosExtras` ou uma regra própria true.)

- [ ] **Step 2: Ajustar o teste "todo item tem id/href único" e as listas por papel**

Em `navegacao.test.ts`, como o item é `regraPropria`, ele **não** entra nas listas de papéis (o teste do admin_geral já filtra `!i.regraPropria`). Rodar para confirmar que nada quebrou:

Run: `npx dotenv-cli -e .env.local -- node --experimental-test-module-mocks --import tsx --test src/lib/navegacao.test.ts`
Expected: PASS (nenhuma lista por papel muda; ids/hrefs seguem únicos).

- [ ] **Step 3: Liberar a flag para o Cesar (via banco)**

Run (adicionar `crm` aos `modulos_extras` do usuário sócio de teste):
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "update usuarios set modulos_extras = array_append(coalesce(modulos_extras,'{}'), 'crm') where email='cesarrodriguestri@gmail.com' and not ('crm' = any(coalesce(modulos_extras,'{}')))"
```
Expected: `OK` (1 linha afetada).

- [ ] **Step 4: Commit**

```bash
git add src/lib/navegacao.ts src/lib/navegacao.test.ts
git commit -m "feat(crm): item de menu /crm atras de flag (regra propria)"
```

---

### Task 6: Portar as telas de CRM (contatos/empresas/deals/tarefas/tags)

**Files:**
- Create: `src/app/(dashboard)/crm/**` (porte de `app/(app)/app/[orgSlug]/(crm)/**` do template)
- Create: `src/lib/crm/orgAtual.ts` — resolve a org fixa + garante membership
- Read (origem): `app/(app)/app/[orgSlug]/**`, `lib/orgs/**`, `lib/auth/guards.ts` do template

**Interfaces:**
- Consumes: `crmServer`, `garantirMembership`, `garantirOrgTeste`.
- Produces: `orgAtualId(): Promise<string>` — id da org de teste, garantindo membership do usuário logado; usado por todas as páginas `/crm` no lugar do `[orgSlug]`.

- [ ] **Step 1: Criar o resolvedor de org fixa**

`src/lib/crm/orgAtual.ts`:
```ts
import { getUsuarioLogado } from '@/lib/auth'
import { garantirOrgTeste, garantirMembership } from './org'

// Fase 1: uma org só. Substitui o [orgSlug] do template. Garante o membership
// do usuário logado no 1º acesso e devolve o id da org.
export async function orgAtualId(): Promise<string> {
  const u = await getUsuarioLogado()
  await garantirMembership(u.id)            // ajustar para o id do auth.users
  return garantirOrgTeste()
}
```

- [ ] **Step 2: Portar as páginas, trocando `[orgSlug]` → org fixa e o cliente → `crmServer`**

Copiar de `app/(app)/app/[orgSlug]/(crm)/**` do template para `src/app/(dashboard)/crm/**`. Regras mecânicas de reescrita em cada arquivo:
- Onde o template lê `params.orgSlug` / `getOrgBySlug(...)`, trocar por `await orgAtualId()`.
- Onde importa o cliente supabase do template (`@/lib/supabase/server`), trocar por `@/lib/crm/supabase/server` (`crmServer`).
- Onde usa guards do template (`requireOrgMember`), trocar por `getUsuarioLogado()` do MOVA + `orgAtualId()`.
- Manter os componentes de UI e as queries (já falam com o schema `crm` pelos tipos gerados).
- Rotas: `/crm`, `/crm/contatos`, `/crm/empresas`, `/crm/negocios`, `/crm/tarefas` (ajustar labels PT).

- [ ] **Step 3: Verificar que compila e a rota carrega**

Run: `npm run build`
Expected: build verde; a rota `ƒ /crm` aparece na listagem.

- [ ] **Step 4: Verificar isolamento (nenhuma tabela do MOVA visível pelo cliente crm)**

Run:
```bash
npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select count(*)::int as vazamentos from information_schema.tables where table_schema='crm' and table_name in ('vendas','usuarios','clientes','lojas','grupos')"
```
Expected: `vazamentos: 0`.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/crm src/lib/crm/orgAtual.ts
git commit -m "feat(crm): telas de contatos/empresas/deals/tarefas em /crm (org fixa)"
```

---

### Task 7: Portar o Inbox (conversas/mensagens/templates/tags)

**Files:**
- Create: `src/app/(dashboard)/crm/inbox/**` (porte de `app/(app)/app/[orgSlug]/(inbox)/**`)
- Read (origem): `lib/messaging/conversations/**`, `templates/**`, `tags/**` do template

**Interfaces:**
- Consumes: `crmServer`, `orgAtualId`.
- Produces: rota `/crm/inbox` (lista de conversas + thread + envio manual).

- [ ] **Step 1: Portar as telas do Inbox com as mesmas regras da Task 6**

Copiar as telas de inbox, aplicando as mesmas 4 regras de reescrita (`[orgSlug]`→`orgAtualId`, cliente→`crmServer`, guards→MOVA, manter UI/queries). O envio manual chama o server action de envio do template (portado no Marco 3).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: verde; rota `ƒ /crm/inbox` presente. (O envio real só funciona após o Marco 3.)

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/crm/inbox
git commit -m "feat(crm): tela de inbox em /crm/inbox"
```

---

## MARCO 3 — Motor (container), webhook e Evolution

### Task 8: Portar o `lib/` do motor (messaging / automations / agent / llm)

**Files:**
- Create: `src/lib/crm/messaging/**`, `src/lib/crm/automations/**`, `src/lib/crm/agent/**`, `src/lib/crm/llm/**` (porte)
- Read (origem): `lib/messaging/**`, `lib/automations/**`, `lib/agent/**`, `lib/llm/**` do template
- Test: manter os testes Vitest do template para engine de automações e adapters (portados junto)

**Interfaces:**
- Produces (nomes que o worker/webhook usam):
  - `processSendOutbound(messageId: string): Promise<void>`
  - `processInboundMessage(...): Promise<void>`
  - `processNextRuns(): Promise<void>` (worker de automações)
  - `sendMessageToConversation(...)`, `sendTemplateToConversation(...)`

- [ ] **Step 1: Copiar o `lib/` do motor e reescrever os imports de dados**

Copiar as pastas do template para `src/lib/crm/`. Regras mecânicas:
- Trocar imports do cliente supabase do template pelos de `@/lib/crm/supabase/*` (service no worker/webhook).
- Trocar imports dos tipos (`@/types/supabase`) por `@/lib/crm/tipos`.
- Manter adapters (`whatsapp-cloud`, `whatsapp-evolution`, `mock`), registry, router, engine, triggers, actions, tools, RAG.
- **Não** portar o caminho de grupo (fora de escopo); manter o envio 1:1.

- [ ] **Step 2: Rodar os testes portados do motor**

Run (Vitest do lib portado):
```bash
npx dotenv-cli -e .env.local -- npx vitest run src/lib/crm
```
Expected: PASS (engine de automações, condições, templating, adapters).

- [ ] **Step 3: Build do app (imports resolvem)**

Run: `npm run build`
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add src/lib/crm/messaging src/lib/crm/automations src/lib/crm/agent src/lib/crm/llm
git commit -m "feat(crm): porte do motor (messaging/automations/agent/llm)"
```

---

### Task 9: Webhook de mensagens no Vercel (persiste rápido)

**Files:**
- Create: `src/app/api/crm/webhooks/messaging/[provider]/route.ts` (porte de `app/api/webhooks/messaging/[provider]/route.ts`)
- Modify: `middleware.ts` do MOVA — liberar `/api/crm/webhooks/*` (sem sessão)

**Interfaces:**
- Consumes: adapters (`verifyWebhook`, `parseWebhook`), `crmService`.
- Produces: endpoint `POST/GET /api/crm/webhooks/messaging/[provider]` que valida, **persiste o inbound** e retorna 200 rápido (o processamento pesado fica no container).

- [ ] **Step 1: Portar o webhook, removendo o processamento pesado do caminho do request**

Copiar o route handler; manter `verifyWebhook` + gravação do inbound (canal por `external_id`, insert em `messages`/evento); **remover** o `after(processWebhook)` pesado (inbound é processado pelo container). GET = verificação (challenge) dos provedores.

- [ ] **Step 2: Liberar a rota no middleware do MOVA**

Em `middleware.ts`, adicionar `/api/crm/webhooks` à whitelist de caminhos sem sessão (mesma ideia do template).

- [ ] **Step 3: Verificar (challenge GET responde 200 sem sessão)**

Run: `npm run build` e um teste manual do GET de verificação (documentar o curl no PR).
Expected: build verde; GET de verificação responde ao challenge.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/crm/webhooks middleware.ts
git commit -m "feat(crm): webhook de mensagens (persiste rapido, sem sessao)"
```

---

### Task 10: Container do motor (worker entrypoint + Dockerfile)

**Files:**
- Create: `worker/index.ts` — sobe os loops de fundo do template contra o schema `crm`
- Create: `worker/Dockerfile`
- Create: `worker/README.md` — variáveis de env e como subir

**Interfaces:**
- Consumes: `processNextRuns`, recovery loops, `processInboundMessage` (Task 8).
- Produces: um processo Node vivo que roda os `setInterval` (automações, recuperação de mensagem/doc/agente, inbound pesado).

- [ ] **Step 1: Escrever o entrypoint do worker**

`worker/index.ts` — importar os runners do template portado e iniciar os intervals (equivalente a `lib/jobs/index.ts` do template), lendo env (`SUPABASE_*`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). Sem servir HTTP (só jobs). Logar cada tick.

- [ ] **Step 2: Dockerfile do worker**

`worker/Dockerfile` — Node 22 Alpine, instala deps, roda `node --import tsx worker/index.ts`. Não-root, healthcheck simples (processo vivo).

- [ ] **Step 3: Verificar local (loops iniciam, sem erro de conexão)**

Run (local, fora do Vercel):
```bash
npx dotenv-cli -e .env.local -- node --import tsx worker/index.ts
```
Expected: logs dos ticks dos loops; sem exceção de conexão ao Supabase. (Ctrl-C encerra.)

- [ ] **Step 4: Garantir jobs DESLIGADOS no Vercel**

Confirmar que o app do MOVA no Vercel roda com `DISABLE_BACKGROUND_JOBS=true` (o motor é só o container). Documentar no `worker/README.md` e no `.env.example`.

- [ ] **Step 5: Commit**

```bash
git add worker
git commit -m "feat(crm): container do motor (worker dos loops de fundo)"
```

---

### Task 11: Evolution API + conectar o canal de teste

**Files:**
- Modify: `worker/README.md` — como subir a Evolution (container ao lado)
- (dados) `crm.channels` — 1 canal `whatsapp_evolution` de teste

**Interfaces:**
- Consumes: server action de conectar canal (`whatsapp-evolution/actions.ts`, portado na Task 8).
- Produces: 1 registro em `crm.channels` com `{ baseUrl, apiKey, instanceName, webhookSecret }`; webhook da Evolution apontando para `/api/crm/webhooks/messaging/whatsapp_evolution`.

- [ ] **Step 1: Subir a Evolution (container isolado, número de teste)**

Documentar no README: subir a Evolution API (imagem oficial), criar uma `instance`, parear um número de teste dedicado. **Não** usar número de produção. Sem envio a grupo.

- [ ] **Step 2: Conectar o canal pela UI de settings (`/crm/settings/channels`)**

Pela tela portada, informar `baseUrl`/`apiKey`/`instanceName`; a action registra o webhook da Evolution e grava em `crm.channels.config`.

- [ ] **Step 3: Teste de ida e volta (aceite do canal)**

Enviar uma mensagem de teste pela UI do Inbox → chega no WhatsApp do número de teste. Responder pelo WhatsApp → aparece no Inbox (o container processa o inbound).
Expected: mensagem sai e entra; conversa criada; contato casado por telefone.

- [ ] **Step 4: Commit**

```bash
git add worker/README.md
git commit -m "docs(crm): subir Evolution e conectar canal de teste"
```

---

## MARCO 4 — Aceite da fase 1

### Task 12: Roteiro de aceite + fechamento

**Files:**
- Create: `docs/crm/aceite-fase1.md` — checklist de aceite executável

**Interfaces:** nenhuma (documentação + verificação end-to-end).

- [ ] **Step 1: Escrever o checklist de aceite**

`docs/crm/aceite-fase1.md` com os 6 itens do roteiro (spec §7):
1. Flag ligada p/ 1 sócio → `/crm` abre com a org de teste (profile+membership).
2. CRUD real: contato, empresa, deal, tarefa, tag.
3. Canal Evolution: enviar e receber 1:1.
4. Automação `message.received → send_whatsapp_message` dispara.
5. Agente responde uma FAQ (RAG) numa conversa.
6. Isolamento: query prova que MOVA não lê `crm` e vice-versa.

- [ ] **Step 2: Executar o roteiro e marcar cada item**

Rodar os 6 passos manualmente; anexar evidência (prints/queries) no doc.
Expected: 6/6 verdes.

- [ ] **Step 3: Suíte + build finais**

Run: `npm test` e `npm run build`
Expected: ambos verdes.

- [ ] **Step 4: Commit**

```bash
git add docs/crm/aceite-fase1.md
git commit -m "docs(crm): roteiro de aceite da fase 1"
```

---

## Self-review (cobertura da spec)

- Spec §2 escopo → Tasks 1–12; não-escopo (Kommo/grupo/grupo↔org/billing) explicitamente ausentes. ✓
- Spec §3.2 schema `crm` isolado → Tasks 1–2 + verificação de isolamento (Tasks 6/12). ✓
- Spec §3.3 login único + org de teste + provisionamento → Tasks 3–4, 6. ✓
- Spec §3.4 motor (envio/recebimento/automações/agente) → Tasks 8–11. ✓
- Spec §3.1 topologia (Vercel telas + container motor) → Tasks 9 (webhook Vercel) + 10 (container). ✓
- Spec §5 segurança (service-role só server/worker, RLS, env) → Tasks 3, 9, 10 + Global Constraints. ✓
- Spec §7 testes/aceite → Task 12. ✓
- Spec §8 rollback (`drop schema crm` + flag) → Global Constraints + Task 5. ✓

**Riscos herdados da spec:** a Task 2 (reescrever ~50 migrations para `crm`) é a de maior incerteza — validar em staging antes; e a Task 3 depende de gerar tipos do schema `crm` (pode exigir poda manual se o CLI do Supabase não autenticar).

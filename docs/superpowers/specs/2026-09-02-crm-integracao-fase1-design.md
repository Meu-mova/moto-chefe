# Integração do CRM "Elite da IA" no MOVA — Fase 1 (teste em paralelo)

**Data:** 2026-09-02
**Status:** Design aprovado (seções 1–2), aguardando revisão da spec
**Abordagem escolhida:** A — CRM no repositório do MOVA, motor em runtime separado

---

## 1. Contexto e objetivo

O MOVA (Next.js 16 no Vercel, Drizzle + `pg` sobre Postgres do Supabase, auth
própria via Supabase Auth `getClaims`, tenancy por cookie `grupoAtivo`) vai
receber um módulo de **CRM + Inbox WhatsApp + automações + agente de IA**,
reaproveitando o template "Elite da IA" (`template-alunos`) que já está na
máquina em `D:\Claude\template_crm_agentes-main\template_crm_agentes-main`.

**Decisão do Cesar:** integrar o CRM ao MOVA e **rodar em paralelo para teste
inicial**; **só depois** aposentar o Kommo. Nada de big-bang.

**Objetivo da fase 1:** ter o CRM navegável e utilizável dentro do MOVA, com
login único e **dados próprios isolados**, para avaliar a ferramenta com risco
zero — sem tocar em Kommo, sem migrar dados reais, sem WhatsApp em grupo.

### Fatos do template que moldam o design (mapeados no código)

- Template = **supabase-js + RLS + organizations/memberships + rotas
  `/app/[orgSlug]`** + tipos gerados (`types/supabase.ts`) + pgvector/realtime/
  storage. ~33 tabelas, ~50 migrations em `supabase/migrations/`.
- **Motor (mensagens, automações, agente) roda em processo Node vivo** — 5
  `setInterval` disparados por `instrumentation.ts` (`lib/jobs/index.ts`).
  Assume container sempre-ligado (EasyPanel/Docker); **não sobrevive no Vercel
  serverless**. Desativável com `DISABLE_BACKGROUND_JOBS=true`.
- **Evolution API** (WhatsApp não-oficial): adapter completo para 1:1
  (`/message/sendText`, `/message/sendMedia`), **mas SEM envio para grupo**
  (`@g.us`) — grupo é código novo. `docker-compose.yml` **não** embute a
  Evolution; ela é hospedada à parte, creds por canal em `channels.config`.
- **Agente de IA:** Vercel AI SDK v6, chat via Anthropic (default
  `claude-haiku-4-5`), **embeddings via OpenAI** `text-embedding-3-small`
  (1536 dims) — exige chave OpenAI mesmo com chat Anthropic. RAG por pgvector
  (RPC `agent_search_kb`).
- **Ambos usam Supabase Auth** (`@supabase/ssr`, cookie) → SSO é de graça se
  apontarem para o **mesmo projeto Supabase** (o `auth.users` é compartilhado).

---

## 2. Escopo

### Na fase 1
- Módulo CRM em `/crm` dentro do app do MOVA, atrás de **flag** (liberação por
  pessoa, começando nos sócios; usa o mesmo mecanismo de navegação do MOVA).
- **Login único** (Supabase Auth já existente no MOVA).
- **Schema `crm` isolado** no mesmo projeto Supabase do MOVA; dados próprios,
  começando limpos.
- CRM (contatos, empresas, deals, tarefas, tags), Inbox, **1 canal WhatsApp via
  Evolution (1:1)**, motor de automações e agente de IA — como o template já faz.
- **Motor num container pequeno** sempre-ligado (junto da Evolution).

### Fora da fase 1 (fases seguintes)
- Aposentar o Kommo; migração de dados do Kommo.
- Ponte/sync com dados reais do MOVA (clientes, leads, vendas).
- **WhatsApp em grupo** (código novo no adapter Evolution).
- Reconciliar **grupo↔org** de verdade (Sul de Minas = uma org, BH = outra).
- Cobrança/billing de assinatura (o template só faz contabilização de tokens LLM).
- Portar o CRM para Drizzle/tenancy do MOVA (decisão de longo prazo).

---

## 3. Arquitetura

### 3.1 Topologia (dois runtimes)

```
┌────────────────────────── Vercel (app MOVA) ──────────────────────────┐
│  /crm/**            → UI + server actions do CRM (supabase-js, RLS,     │
│                       schema crm). Jobs de fundo DESLIGADOS.            │
│  /api/crm/webhooks/ → recebe Evolution/WhatsApp; valida, PERSISTE o     │
│    messaging/[prov]   inbound e responde rápido (processamento pesado    │
│                       fica no container). Envio 1:1 pode ser imediato.   │
│  (resto do MOVA)    → Drizzle + pg, schema public, intocado.           │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  mesmo Supabase (auth + schema crm)
┌───────────────────────── Container "motor" ───────────────────────────┐
│  worker: loops do template (automations worker, recovery de mensagem/  │
│          agente/doc) contra o schema crm via service client.           │
│  Evolution API self-hosted (ou ao lado), creds em crm.channels.config. │
└───────────────────────────────────────────────────────────────────────┘
```

- **Por que dois runtimes:** as telas não precisam de processo vivo (rodam bem
  no Vercel); o motor precisa (intervals + retries + agente longo). O container
  é necessário de qualquer forma para hospedar a Evolution.
- **Código compartilhado:** o `lib/` do template (messaging, automations, agent,
  supabase, llm) é portado para o repo do MOVA e **importado pelos dois** — pelo
  app Vercel (UI/actions/webhook) e por um **entrypoint de worker** enxuto que só
  roda os loops de fundo. Evita duplicar a lógica do motor.

### 3.2 Dados e schema

- **Mesmo projeto Supabase** (dá o SSO). Tabelas do CRM num **schema `crm`**.
- **Adaptação das migrations (maior lift da fase 1):** rodar as ~50 migrations
  do template criando os objetos em `crm` (não `public`). Cliente supabase-js do
  módulo configurado com `db.schema = 'crm'`; tipos regerados para o schema.
  `auth` e a extensão `vector` são globais → login e RAG seguem. Helpers de RLS
  (`is_org_member`, `has_org_role`) e RPCs passam a viver em `crm`.
- **Isolamento:** o Drizzle do MOVA não referencia `crm`; o CRM não referencia o
  `public` do MOVA. Reverter = `drop schema crm cascade` + desligar a flag.
- **Aplicação das migrations:** seguem o caminho de migração do MOVA
  (`scripts/sql.ts` — SQL manual; ver memória de migrações), não o drizzle-kit.

### 3.3 Auth e tenancy

- Sócios já são usuários do Supabase Auth do MOVA → **sem segundo cadastro**.
- **Uma org de teste** ("MOVA — Teste"). Ao abrir `/crm` a primeira vez, um
  upsert (service client) garante `crm.profiles` + `crm.memberships` da pessoa
  nessa org. Papel padrão `member` (ou `owner` para o Cesar).
- Rotas do template (`/app/[orgSlug]/...`) montadas em **`/crm`** com a org
  fixada (slug escondido). grupo↔org fica para fase 2.
- **RLS mantida** nas tabelas `crm` (contexto do usuário vem da sessão Supabase
  compartilhada). Workers usam **service client** (ignora RLS), como o template.

### 3.4 Motor (mensagens, automações, agente)

- **Envio (disparador):** `processSendOutbound` (router) escolhe o adapter pelo
  tipo do canal. Na fase 1: **Evolution 1:1**. Envio imediato via `after()` no
  webhook/action; **cron de recuperação** re-dirige `messages` presas em
  `sending`.
- **Recebimento:** webhook `/api/crm/webhooks/messaging/[provider]` valida (HMAC
  Cloud / Bearer Evolution) e **persiste o inbound rápido**; o **container** faz o
  processamento pesado (`processInboundMessage`: cria conversa, casa contato por
  telefone, emite eventos de automação e **dispara o agente** se o canal tiver
  `agent_id`) — assim as chamadas longas de LLM ficam fora do Vercel.
- **Automações:** engine dirigido a evento (tabelas `automations`,
  `automation_runs`, `automation_run_steps`); worker (`processNextRuns`) roda **no
  container**. Ações incluem `send_whatsapp_message`, `create_deal`, tags, etc.
- **Agente de IA:** RAG por pgvector (FAQ + docs), tools de CRM, teto de tokens
  por agente. Chat via Anthropic, **embeddings via OpenAI**.
- **Evolution:** instância self-hosted no/junto ao container; `baseUrl`+`apiKey`
  por canal em `crm.channels.config`. **Sem grupo** nesta fase.

---

## 4. Componentes e interfaces

| Unidade | O que faz | Depende de |
|---|---|---|
| `app/crm/**` (Vercel) | UI + server actions do CRM/Inbox | supabase-js (schema crm, RLS), sessão Supabase do MOVA |
| `app/api/crm/webhooks/messaging/[provider]` | recebe mensagens, enfileira | adapters, service client |
| `lib/crm/**` (portado) | messaging (router/adapters), automations (engine/worker), agent (run/rag/tools), supabase clients, llm | Supabase (crm), Evolution, Anthropic, OpenAI |
| worker entrypoint (container) | roda os loops de fundo | `lib/crm/**`, service client |
| Evolution API (container) | transporte WhatsApp 1:1 | — |
| Provisionamento de org/membership | garante profile+membership no 1º acesso | service client |

**Fronteiras:** a UI fala só com o schema `crm` via RLS; o motor fala com `crm`
via service client; nenhum dos dois cruza o `public` do MOVA na fase 1.

---

## 5. Segurança

- **Service-role key** só no container/worker e nos webhooks server-side; nunca
  no cliente. RLS ativa em todas as tabelas `crm`.
- Segredos **só em env** (Supabase service role, Evolution apiKey, ANTHROPIC e
  OPENAI keys) — nos dois runtimes. Nada versionado.
- A regra do MOVA de **separar por grupo** ainda não se aplica (org única de
  teste); vira requisito na fase 2 (grupo↔org).
- Isolamento por schema é também barreira de segurança: um vazamento de query no
  CRM não alcança dados do MOVA e vice-versa.

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Adaptar 50 migrations para o schema `crm` (RLS helpers, RPCs, referências a `public`) | Maior tarefa da fase; validar num Supabase de staging antes; testes de isolamento |
| Dois estilos de dado (Drizzle + supabase-js) e dois runtimes = mais manutenção | Aceito para a fase de teste; reversível; consolidação é decisão da fase 2 |
| Evolution: risco de ban / manutenção do host | Número dedicado de teste; container isolado; sem grupo (menor superfície) |
| Latência de automações via container | Aceitável em volume de teste; envio de mensagem é imediato via `after()` |
| Chave OpenAI nova (embeddings) | Provisionar antes; sem ela o agente/RAG não sobe |

## 7. Testes e verificação

- **Automatizados:** manter os testes do `lib/` portado (Vitest do template) para
  engine de automações e adapters; rodar no CI do container/módulo.
- **Manuais (roteiro de aceite da fase 1):**
  1. Flag ligada para 1 sócio → `/crm` abre com a org de teste (profile+membership
     provisionados).
  2. Criar contato, empresa, deal, tarefa, tag — CRUD real.
  3. Conectar 1 instância Evolution a um número de teste; **enviar** e **receber**
     mensagem 1:1 (conversa criada, contato casado).
  4. Disparar uma automação (`message.received → send_whatsapp_message`).
  5. Agente responde uma FAQ (RAG) numa conversa.
  6. **Isolamento:** confirmar que nenhuma query do MOVA lê `crm` e vice-versa.

## 8. Rollback

Desligar a flag + `drop schema crm cascade` + parar o container. Zero impacto no
MOVA (schema `public`, Drizzle e Kommo intocados).

## 9. Perguntas em aberto (fases seguintes)

- Modelo grupo↔org (uma org por grupo? por loja?) e como a RLS do template
  convive com a separação por grupo do MOVA.
- Plano de saída do Kommo (hoje alimenta métricas de atendimento) e migração de
  dados.
- Envio para **grupo** no adapter Evolution (código novo).
- Longo prazo: portar o CRM para Drizzle/tenancy do MOVA, ou manter supabase-js/
  RLS como subsistema à parte.

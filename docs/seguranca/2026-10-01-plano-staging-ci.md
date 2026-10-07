# Plano — staging separado da produção, fluxo `dev`/`main` e CI

Data: 2026-10-01 · Autor: Luis Carlos · Status: **decisões fechadas em grill (Luis);
execução ainda não começou; itens do Cesar pendentes (§8)**.

Continuação do relatório `2026-09-30-etapa-1-relatorio.md` (etapas 2 e 6) e do handoff de
diagnóstico arquitetural (gaps G2 e G3). Substitui a primeira versão deste arquivo.

Legenda: **V** = verificado (código, API, CLI ou doc oficial) · **S** = suposição / a confirmar.

## 1. Objetivo

1. Ninguém desenvolve, testa ou roda script contra o banco de produção sem querer.
2. `main` só recebe código que passou por PR e CI verde. `dev` é onde se integra e valida.
3. CI que pega o que já quebrou de verdade aqui: tipo, build, SQL de migração, segredo no
   diff, app que não abre. Nada decorativo.

## 2. Fatos que condicionam o plano (V, salvo indicação)

| Área | Fato |
|---|---|
| Vercel | Projeto na conta Hobby do Cesar; `main` = produção, deploy automático. Preview deployments existem em qualquer branch; **variáveis de Preview desconhecidas** (podem ser as de produção). Hobby: só uso não comercial, sem membros de time. Cron roda só em produção. "Preview branch for staging" (branch persistente + domínio + variáveis por branch) funciona no Hobby. Node 24.x é o padrão; `engines.node` manda. DNS de `meumova.com` está na Vercel. |
| GitHub | Repo privado `cesarrodriguesia/moto-chefe`, Cesar dono, Luis colaborador (write). Em repo pessoal **não existe admin além do dono**: Luis não cria secret, não instala app, não configura ruleset. Plano Free → sem proteção de branch em repo privado. Org `Moto-Chefe` criada por Luis (owner), convite do Cesar como owner pendente desde 30/09, billing no Gmail do Luis. Actions habilitado, 2.000 min/mês grátis. Zero PRs no histórico. |
| Supabase | Prod `Estoque Chassi`, org "Motochefe Sul de Minas", Free, PG 17, 1 de 2 projetos ativos. Luis é Developer (não cria projeto; Owner/Administrator criam). Free pausa projeto após 7 dias sem uso. Branching é Pro+. |
| Schema | Não reproduzível por replay: 107 migrações SQL à mão, journal Drizzle quebrado, `rls.sql`/`rpcs.sql`/`supabase-extras.sql` fora da trilha, RLS das ~70 tabelas vindo de trigger do Supabase. Nenhum registro de qual migração rodou em qual banco. |
| Verificação | `type-check` 7 s; `npm test` 2,4 s, 878 ok, sem banco nem env; `next build` **passa sem nenhuma env** (15 s, 82 rotas, nenhuma estática que leia banco). Lista do `npm test` cita `scripts/conciliacao/terminais.test.ts` (não existe) e esquece `src/lib/busca-peca.test.ts`. Sem `.nvmrc`/`engines`; local Node 24. `playwright` já é devDependency. Sem ESLint/Prettier. Next 16 avisa que `middleware.ts` está depreciado em favor de `proxy.ts`. |
| Revisão por IA | CodeRabbit: grátis só em repo público; privado US$ 24/dev/mês. `claude-code-action@v1` + plugin `code-review` aceita `CLAUDE_CODE_OAUTH_TOKEN` gerado por `claude setup-token` (1 ano, Pro/Max/Team/Enterprise, consome a cota da assinatura, não API). Code Review gerenciado da Anthropic: só Team/Enterprise, US$ 15–25/review. |
| Cofre | Bitwarden organização Free: 2 usuários, 2 coleções. 1Password Teams Starter Pack US$ 24,95/mês. |

## 3. Decisões (log do grill de 2026-10-01)

Cada item vira ADR curto em `docs/adr/` na fase 11; aqui é o registro de referência.

**Ambiente**
- D1. Staging = projeto Supabase `mova-staging` na org "Motochefe Sul de Minas", Free, `sa-east-1`, PG 17. Criado pelo Luis após ser promovido a Administrator. Pausa por inatividade aceita; runbook de reativação. Vira Pro quando o backup da Etapa 1 for comprado.
- D2. Schema nasce de **dump schema-only da produção**, congelado em `supabase/schema-baseline.sql`. Nunca re-dumpado; tudo depois é migração. `rls.sql`, `rpcs.sql`, `supabase-extras.sql` ficam com cabeçalho "histórico; a verdade é baseline + migrações". Função SQL nova só nasce em migração.
- D3. **Zero dado real fora de produção.** `scripts/seed-staging.ts` espelha a estrutura (3 grupos, 8 lojas, modelos do catálogo) com nomes fictícios, 1 usuário por papel por grupo, ~30 motos, ~10 vendas, ~5 OS, categorias. Usuários `@teste.meumova.com`, senha única no cofre. Anonimização de dump real só se um bug exigir, com script revisado.
- D4. Tabela `schema_migrations` + `scripts/migrate.ts`: aplica em ordem só os arquivos pendentes, registra, baseline marcado como 0000–0110 aplicadas. Automático no staging a cada push em `dev`; produção manual com `--prod`.
- D5. `.env.local` → staging nas máquinas do Luis **e do Cesar**. Produção só via `.env.production.local` explícito. `scripts/sql.ts` imprime o host e exige `--prod` quando for produção.
- D6. Vercel: Preview = staging. Variáveis de Preview apontam para `mova-staging`. Domínio `dev.meumova.com` atribuído à branch `dev`. Deployment Protection **desligada** nos previews (o app tem login próprio; no Hobby só o Cesar veria previews protegidos). *Revisto em 2026-10-07: proteção mantida (ADR 0003, "Situação em 2026-10-07").* Node 24 via `engines`. Cesar configura com checklist do Luis; Vercel Pro vai como item separado (uso comercial no Hobby).
- D7. Integrações no staging: Nota Gateway em **homologação** (configurada por grupo em `/admin/notas-fiscais` do staging, certificado de teste); Resend em teste; Bling, Kommo, Telegram, WhatsApp/mcp.ai, Jarvis e cron **desligados**.
- D8. Segredos do staging gerados pelo Luis (`CERT_MASTER_KEY` nova, `CRON_SECRET` novo, chaves do projeto novo). Compartilhamento só por **Bitwarden organização Free**, coleções "MOVA staging" e "MOVA infra". Nunca WhatsApp.

**Git**
- D9. Repo transferido para a org `Moto-Chefe`; plano **Team** (US$ 4/usuário/mês, 2 usuários). Luis e Cesar owners. E-mail de cobrança e cartão da empresa. Integração Git da Vercel reconectada após a transferência.
- D10. Branches: `dev` (integração/staging) e `main` (produção). `feat/*`, `fix/*`, `chore/*` nascem de `dev`, PR para `dev` com **squash**. `dev → main` por PR com **merge commit**, sempre que houver algo validado e no mínimo semanal. Hotfix nasce de `main`, PR para `main`, depois PR `main → dev`. Cesar segue o mesmo fluxo.
- D11. Rulesets em `dev` e `main`: PR obrigatório, checks `ci` e Vercel obrigatórios, sem force-push, sem deleção. **Bypass** só para o papel admin do repo e só em dois casos: CI indisponível/quebrado por causa alheia ao código durante incidente em produção, ou revert travado. Todo bypass gera issue no mesmo dia e o CI roda depois. Hotfix normal não é bypass.
- D12. PRs do Luis: CI verde + comentários da revisão IA lidos, sem aprovador obrigatório. PRs do Cesar: Luis revisa. Template de PR de 5 linhas (o que muda, migração?, testado no staging?, diálogo/Server Action testado no navegador?, tamanho justificado?).
- D13. Diretriz de tamanho de PR em `CONTRIBUTING.md` (alvo ≤ ~400 linhas de produção; > 500 só com justificativa; alerta, não bloqueio; não contam testes, docs, gerados, lockfiles, renomeações; uma responsabilidade por PR; refactor separado de comportamento). Action que conta linhas de produção e rotula `pr/grande` acima de 400 com comentário, nunca falha.
- D14. Feature flags: **adiado**; registrado como pendência. Provável resposta futura: tabela por grupo.

**CI**
- D15. Fase A (`ci.yml`): `pull_request` para `dev`/`main` e `push` em `dev`/`main`; jobs `type-check`, `test`, `build`, **gitleaks** (bloqueante), **knip** e **`npm audit`** (aviso, `continue-on-error`, até limpar libs mortas e trocar `xlsx`); Node 24; `concurrency` cancelando run anterior do mesmo PR; zero secrets.
- D16. Fase B: job `migracoes` com Postgres 17 em service container, aplica `schema-baseline.sql` + migrações novas do PR via `migrate.ts`.
- D17. Fase D: smoke Playwright contra o preview quando a Vercel marca "ready": login + `/dashboard`, `/estoque`, `/vendas`, `/ordens-servico`, `/conciliacao`, `/folha-pagamento`, `/financeiro`, `/admin/notas-fiscais`, com usuários sintéticos `aux_adm` e `admin_geral`. Falha em 500, erro de console ou redirect para `/login`.
- D18. Check da Vercel ("preview deployment ready") obrigatório junto com `ci`.
- D19. Revisão por IA: `claude-code-action@v1` + plugin `code-review`, `CLAUDE_CODE_OAUTH_TOKEN` da assinatura Max do Luis, a cada push em PR para `dev`, `concurrency` cancelando a anterior, `--max-turns` baixo, papéis da diretriz no prompt (IA: bugs locais, padrões, nulls, bordas, legibilidade; humano: design, regra de negócio, impacto, qualidade dos testes). Reavaliar cota em 2 semanas; plano B = API key da empresa com teto.
- D20. Dependabot: alertas + atualização semanal agrupada (minor/patch juntos, major separado, limite 5 PRs), PRs contra `dev`, Luis mergeia com CI verde.
- D21. Fora deste plano, com plano próprio: fase C (testes de integração, G3 do handoff); lint/formatação com **Biome** (não ESLint + Prettier — decidido em 2026-10-01, ver §5.10), job `lint` entra no CI quando esse plano estiver pronto.

**Docs**
- D22. ADRs em `docs/adr/`; runbooks em `docs/infra/`; `AGENTS.md` reescrito na seção de ambiente; `.env.example` completo; `CONTRIBUTING.md` na raiz.

## 4. Arquitetura resultante

```
máquina do dev ──.env.local──────────────▶ Supabase mova-staging (dado sintético)
      │  .env.production.local (explícito, --prod)  ──▶ Supabase Estoque Chassi (produção)
      │
      ├─ feat/* ──PR squash──▶ dev ──PR merge commit (≥ semanal)──▶ main
      │                        │                                     │
GitHub Actions (CI)            │ Vercel Preview                      │ Vercel Production
 type-check · test · build     │ dev.meumova.com                     │ moto-chefe.vercel.app
 gitleaks · knip · audit       │ vars Preview → staging              │ vars Production → prod
 migracoes (PG17 efêmero)      │ migrate.ts automático no staging    │ migrate.ts --prod manual
 smoke Playwright ─────────────┘ cron NÃO roda                       │ cron roda
 revisão IA (Max) · Dependabot · pr-size
```

## 5. Detalhes por componente

### 5.1 Supabase `mova-staging`
- Criar na org "Motochefe Sul de Minas", `sa-east-1`, PG 17 (igual à prod). Nome `mova-staging`.
- Dump: `pg_dump --schema-only --no-owner --no-privileges` da produção, via `brew install libpq`
  (pg_dump 17; sem depender do Docker), por conexão direta ou pooler de **sessão** (não 6543).
  Revisar o arquivo antes de aplicar: remover objetos de schemas gerenciados pelo Supabase que
  o dump trouxer e que o projeto novo já tem. **S:** event triggers do Supabase podem não vir
  ou falhar na restauração; conferir RLS ligado nas 84 tabelas depois de aplicar.
- Reaplicar à mão os `INSERT INTO storage.buckets` de `0051` e `0077` (dado, não schema).
- Auth: usuários via Admin API com `email_confirm: true`; SMTP padrão basta porque nada envia e-mail.
- Conferência pós-criação: contagem de tabelas, funções (12 RPCs), policies, buckets; grants
  de `anon`/`authenticated` iguais aos da prod (inclusive os ruins: o staging herda a policy
  `leitura_global` do relatório da Etapa 1, e é **nele** que a correção de RLS será testada antes de ir à produção).
- Runbook `docs/infra/staging.md`: criar/recriar, reativar quando pausar, reseed.

### 5.2 Seed (`scripts/seed-staging.ts`)
- Idempotente (apaga e recria o conjunto sintético). Recusa rodar se o host for o de produção.
- Conteúdo: 3 grupos, 8 lojas, modelos do catálogo, 1 usuário por papel por grupo
  (`admin_geral`, `admin_socio`, `aux_adm`, `vendedor`, `mecanico`, …), ~30 motos em status
  variados, ~10 vendas, ~5 OS, categorias de caixa/despesa.
- Nota Gateway em homologação: configurar por grupo pela UI do staging após o seed; token de
  homologação no cofre.

### 5.3 `schema_migrations` + `scripts/migrate.ts`
- Tabela: `arquivo text primary key, aplicado_em timestamptz, checksum text`.
- Comportamento: lista `src/lib/db/migrations/NNNN_*.sql`, aplica em ordem os não registrados,
  um arquivo por transação (`.simple()` como o `sql.ts` já faz), registra. Falha se houver
  registro na tabela sem arquivo no repo (alguém rodou algo fora) ou checksum divergente.
- Baseline: ao criar o staging e, uma vez, em produção, inserir 0000–0110 como aplicadas.
- `--prod` obrigatório quando o host for o de produção; imprime host antes de qualquer coisa.
- `scripts/schema-diff.sh`: dump schema-only de staging e produção, `diff`; rodar antes de cada `dev → main`.

### 5.4 Máquina local
- `.env.local` = staging. `.env.production.local` = produção (coberto por `.env*` no `.gitignore`).
- Scripts contra produção: `npx dotenv-cli -e .env.production.local -- node --import tsx scripts/migrate.ts --prod`.
- `.env.example` lista as variáveis abaixo com comentário de propósito.

### 5.5 Vercel (executado pelo Cesar com checklist do Luis)
Variáveis lidas pelo código (V, `grep process.env`), e o valor no ambiente **Preview**:

| Grupo | Variáveis | Preview |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | do `mova-staging` |
| App | `NEXT_PUBLIC_APP_URL`, `MOVA_URL`, `EMAIL_FROM`, `LEADS_EMAIL_TO` | `https://dev.meumova.com`, remetente de teste, caixa interna |
| Fiscal | `CERT_MASTER_KEY` (nova, só staging), `NFSE_CERT_PATH`, `NFSE_CERT_PASS` | chave nova; cert vazios |
| Segurança | `CRON_SECRET` (novo), `JARVIS_API_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET` | novo; demais vazios |
| Integrações | `TELEGRAM_BOT_TOKEN`, `WHATSAPP_ALERTA_NUMERO`, `MCPAI_ENDPOINT_URL`, `MCPAI_WHATSAPP_URL`, `BLING_REDIRECT_URI`, `BLING_NATUREZA_OPERACAO`, `KOMMO_REDIRECT_URI` | vazios |
| E-mail | `RESEND_API_KEY` | chave de teste ou vazio |
| Usuários | `DEFAULT_USER_PASSWORD` | senha dos sintéticos (cofre) |
| Automáticas | `NODE_ENV`, `VERCEL_URL`, `VERCEL_ENV` | nada a fazer |

- **S:** com integração desligada, a tela que a usa pode dar erro no staging em vez de aviso. Aceito; registrar quando aparecer.
- Domínio `dev.meumova.com` → Preview, Git Branch `dev`. Deployment Protection: off para Preview. Node: `engines` resolve.
- **Antes de tudo**: responder o que está hoje em Preview. Se for igual a produção, nenhum preview é usado para teste até trocar.

### 5.6 GitHub
- Transferência para `Moto-Chefe`; Team; Luis e Cesar owners; billing da empresa.
- Rulesets (`dev`, `main`) conforme D11. Bypass list = Repository admin. Política escrita em `docs/infra/bypass.md`.
- `CONTRIBUTING.md` (D13), `.github/pull_request_template.md` (D12), `.github/dependabot.yml` (D20).
- Secrets do repo (criados pelo Luis após a transferência): `CLAUDE_CODE_OAUTH_TOKEN`, `STAGING_DATABASE_URL`, usuários/senha do smoke.

### 5.7 Workflows
| Arquivo | Dispara | Faz |
|---|---|---|
| `ci.yml` | PR → `dev`/`main`; push `dev`/`main` | `npm ci`, `type-check`, `test`, `build`, gitleaks; knip e `npm audit` com `continue-on-error` |
| `migracoes.yml` | PR → `dev`/`main` | Postgres 17 service, baseline + `migrate.ts`; em push `dev`, `migrate.ts` contra o staging |
| `smoke.yml` | `deployment_status` success (preview) | Playwright, 9 telas, 2 usuários |
| `claude-code-review.yml` | PR → `dev` (opened, synchronize, ready_for_review) | `claude-code-action@v1`, plugin `code-review`, `--comment`, papéis no prompt, `--max-turns` |
| `pr-size.yml` | PR | conta linhas de produção; label `pr/grande` + comentário > 400 |

Orçamento: ~5 min por run de CI; estimativa < 500 min/mês dos 2.000.

### 5.8 Cofre
- Bitwarden organização Free, 2 usuários, coleções "MOVA staging" (credenciais do projeto,
  `CERT_MASTER_KEY`, senha dos sintéticos, token de homologação da Nota Gateway) e "MOVA infra"
  (tokens de CI, acesso a domínios). Nada de produção vai para o cofre neste plano.

### 5.9 Docs
- ADRs: 0001 staging em projeto separado com schema por dump; 0002 branches `dev`/`main` e regras de PR;
  0003 CI como portão, Vercel como entrega; 0004 migrações versionadas com `schema_migrations`;
  0005 dado sintético fora de produção; 0006 revisão por IA com assinatura.
- Runbooks em `docs/infra/`: `staging.md`, `migracoes.md`, `bypass.md`, `revisao-ia.md` (rotação do token), `vercel-checklist.md`.
- `AGENTS.md`: seção "Não existe ambiente de desenvolvimento" reescrita.

### 5.10 Lint/formatação — ferramenta decidida, rollout fora deste plano
- Decisão de 2026-10-01: a ferramenta será **Biome** (`@biomejs/biome`), não ESLint + Prettier.
  Único binário Rust fazendo lint + formatação + organização de import, um config (`biome.json`),
  sem sincronizar regra entre duas ferramentas.
- **V (docs oficiais/GitHub do Biome, checado em 2026-10-01):**
  - Instalação `npm i -D -E @biomejs/biome`; `npx @biomejs/biome init` gera `biome.json`;
    `npx @biomejs/biome check --write` formata + linta + organiza imports.
  - `useExhaustiveDependencies` cobre `useEffect/useLayoutEffect/useInsertionEffect/useCallback/
    useMemo/useImperativeHandle` — equivalente ao `react-hooks/exhaustive-deps` do ESLint, que é a
    regra que mais importa num app React 19 com Server Actions.
  - `useSortedClasses` (ordenação de classes Tailwind) existe mas é **parcial**: não lê config
    JS/CSS do Tailwind, não suporta variante de breakpoint (`md:`, `max-lg:`) nem utilitário/variante
    customizado, e o fix é classificado **unsafe** (não roda sozinho no "format on save").
  - Sem equivalente a `eslint-plugin-jsx-a11y` confirmado — acessibilidade fica sem lint automático.
- **S (não verificado):** paridade com `eslint-plugin-import` (ordem/ciclo de import) e com regras
  específicas que times Next.js costumam ligar; comparar quando for implementar.
- **O que fica para quando este item for implementado** (plano próprio, "com calma" — Q19 do grill):
  baseline em ~77 mil linhas sem lint hoje; momento de rodar a formatação em massa num commit
  isolado (não quebrar `git blame`); decidir se `useSortedClasses` entra dado o fix unsafe; decidir
  cobertura de acessibilidade sem o equivalente ao `jsx-a11y`; quando o job `lint` do CI passa de
  aviso a bloqueante.

## 6. Fases

| # | Entrega | Quem | Depende de | Esforço |
|---|---|---|---|---|
| 1 | Branch `dev`; PR → `dev` com `.nvmrc`, `engines`, lista de testes corrigida, `ci.yml` fase A, `CONTRIBUTING.md`, template de PR, `dependabot.yml`, `.gitignore` (`supabase/.temp/`) | Luis | nada | 1 dia |
| 2 | Responder Preview da Vercel; promover Luis a Administrator (Supabase); aceitar convite da org; transferir repo; aprovar Team; reconectar Vercel ao repo | Cesar | — | 1 h |
| 3 | `mova-staging` + `schema-baseline.sql` + buckets + conferência | Luis | 2 (Admin), libpq | 1 dia |
| 4 | `schema_migrations`, `migrate.ts`, `sql.ts --prod`, `schema-diff.sh`; baseline registrado em staging e prod | Luis | 3 | 1 dia |
| 5 | `seed-staging.ts`, usuários sintéticos, Nota Gateway homologação | Luis | 3 | 1–2 dias |
| 6 | Cofre Bitwarden; credenciais do staging; `vercel-checklist.md`; Cesar configura Preview, domínio, proteção | Luis + Cesar | 3, 5 | 1 h cada |
| 7 | `.env.local` → staging nas duas máquinas; `.env.production.local`; `.env.example`; `AGENTS.md` | Luis + Cesar | 6 | ½ dia |
| 8 | Rulesets `dev`/`main`; `claude-code-review.yml` + token; `pr-size.yml` | Luis (admin pós-transferência) | 2 | ½ dia |
| 9 | `migracoes.yml` (fase B) + migração automática no staging | Luis | 4 | 1 dia |
| 10 | `smoke.yml` (fase D) | Luis | 5, 6 | 1–2 dias |
| 11 | ADRs + runbooks | Luis | ao longo | ½ dia |

Ordem: 1 imediatamente; 2 na primeira hora livre do Cesar; 3–5 em sequência; 6–8 assim que 2 e 5 existirem; 9–10 depois; 11 ao longo.

## 7. Custos

| Item | Mensal | Decisão |
|---|---|---|
| Supabase `mova-staging` (Free) | US$ 0 | fechada |
| GitHub Actions (Free) | US$ 0 | fechada |
| GitHub Team (2 usuários) | US$ 8 | **Cesar** |
| Bitwarden org Free | US$ 0 | fechada |
| Revisão IA (cota Max do Luis) | US$ 0 extra | fechada; plano B API com teto US$ 30 |
| Vercel Pro (1 assento p/ Luis) | US$ 20 | **Cesar**; motivo: uso comercial no Hobby **e** (achado 2026-10-01) Hobby não suporta colaborador — nenhum preview de PR do Luis builda sem isso |
| Supabase Pro (backup diário) | US$ 25 | **Cesar**, pendência da Etapa 1 |

## 8. Checklist do Cesar (em ordem)

1. **Vercel**: por que o deployment do PR #1 (fase 1, só config/CI, já mesclado em `dev`) saiu
   com status "Deployment was blocked"? **Achado em 2026-10-01, não confirmado por mim (sem
   acesso ao painel):** relatos públicos de outros usuários do plano Hobby descrevem exatamente
   esse sintoma quando o autor do commit/PR não tem acesso de colaborador no projeto Vercel —
   e o Hobby **não tem conceito de colaborador/time** (confirmado na doc oficial). Se for isso,
   não dá para "adicionar o Luis": o Hobby não permite, só resolve virando Pro (item 6). Cesar
   precisa abrir o deployment do PR no painel (Deployments) e ver o motivo exato.
2. **Supabase → org "Motochefe Sul de Minas" → Team**: promover Luis a Administrator (vai criar `mova-staging`).
3. **GitHub**: aceitar o convite da org `Moto-Chefe` (owner); transferir `moto-chefe` para a org; aprovar o plano Team (US$ 4/usuário/mês); colocar e-mail e cartão da empresa no billing da org. Depois, reconectar o repo na Vercel.
4. **Vercel**, com o checklist do Luis: colar as variáveis de Preview; domínio `dev.meumova.com` → branch `dev`; Deployment Protection off para Preview.
5. **Máquina dele**: trocar `.env.local` para o staging (credenciais chegam pelo Bitwarden).
6. **Vercel Pro (US$ 20/mês), com Luis como membro**: deixou de ser só "decidir separado por
   causa do uso comercial" — se o item 1 confirmar a hipótese, é pré-requisito técnico para
   qualquer preview de PR do Luis builda. Sem isso, a Vercel nunca gera preview pro trabalho
   dele, e as fases D (smoke Playwright) e o check obrigatório da Vercel (D18) não têm como
   funcionar. Supabase Pro (backup, US$ 25/mês) continua decisão separada, sem essa urgência.

Mensagem pronta para colar:

> Cesar, fechei o plano de staging + CI (docs/seguranca/2026-10-01-plano-staging-ci.md) e já
> abri e mesclei o primeiro PR em `dev` (só config/CI, nada de produto, CI passou). Mas o
> deployment da Vercel desse PR saiu bloqueado ("Deployment was blocked"), e acho que é porque
> eu não sou colaborador no teu projeto Vercel — no plano Hobby isso nem dá pra resolver
> adicionando colaborador, porque Hobby não tem esse conceito. Preciso de 6 coisas suas,
> nessa ordem: (1) abrir esse deployment no painel da Vercel e confirmar a causa; (2) me
> promover a Administrator na org do Supabase; (3) aceitar o convite da org Moto-Chefe no
> GitHub, transferir o repo pra lá e aprovar o plano Team (US$ 8/mês pelos dois, é o que
> permite travar a main e a dev para só aceitar PR com CI verde); (4) colar as variáveis de
> Preview e o domínio dev.meumova.com na Vercel com o checklist que vou te mandar; (5) trocar
> o .env.local da sua máquina para o staging; (6) assinar o Vercel Pro (US$ 20/mês) e me
> adicionar como membro — isso não é mais só sobre o Hobby ser pra uso não comercial, é que
> sem isso eu não consigo nem gerar preview das minhas PRs. Custo novo imediato: US$ 28/mês
> (US$ 8 do GitHub Team + US$ 20 do Vercel Pro). Supabase Pro (backup) eu deixaria pra depois,
> sem a mesma urgência.

## 9. Riscos e cuidados

- Preview da Vercel pode apontar para produção **hoje**: nada de testar em URL de preview antes do item 1 do Cesar.
- Dump só `--schema-only`; nunca `--data-only`; nunca certificado A1 real nem `CERT_MASTER_KEY` de produção no staging.
- Token da revisão IA é pessoal (Luis), vive como secret do repo e consome a cota Max; expira em 1 ano. **S:** forma de revogação não está na doc; confirmar antes de gerar.
- Branch `dev` longa acumula diferença: `dev → main` pequeno e pelo menos semanal.
- Staging Free pausa após 7 dias: vai parecer "caiu"; runbook de uma linha.
- Transferência do repo muda a URL: remotes locais, Vercel e o GitHub App do Claude precisam ser apontados de novo.
- **S:** não abri a doc de disponibilidade do Dependabot em repo privado Free; se não estiver disponível, cai para `npm audit` informativo até a org ter Team.
- **S:** evento `deployment_status` da Vercel precisa expor a URL do preview ao job de smoke; confirmar na implementação.

## 10. Pronto quando

- `npm run dev` em qualquer máquina do time bate no staging por padrão; produção exige `.env.production.local` e `--prod`.
- PR aberto roda CI e revisão IA; `dev` e `main` só recebem merge de PR com `ci` e Vercel verdes.
- Preview de PR abre em `dev.meumova.com`, logado com usuário sintético, sem dado real.
- Migração nova passa pelo job de CI e pelo staging antes de produção; `schema_migrations` igual nos dois bancos; `schema-diff.sh` sem diferença antes do release.
- Bypass zero no primeiro mês, ou todos com issue.

## 11. Fora deste plano

Fase C (testes de integração), rollout do Biome (lint/formatação — ferramenta já decidida, §5.10), feature flags, correção do RLS (Etapa 1, será testada no staging), migração `middleware.ts → proxy.ts`, troca do `xlsx`, limpeza de libs mortas apontadas pelo knip, Supabase Pro, Vercel Pro.

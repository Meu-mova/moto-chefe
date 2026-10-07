# Segredos e variáveis de ambiente

Onde cada segredo do MOVA mora, qual é a fonte da verdade e as regras de manuseio. A lista de
nomes, com o propósito de cada um e os padrões não secretos, está em `.env.example`. Plano de origem:
`docs/seguranca/2026-10-01-plano-staging-ci.md` (D5, D8, §5.4–5.6).

## Onde mora cada coisa

| O quê | Fonte da verdade | Cópias permitidas |
|---|---|---|
| Produção | **Vercel → Environment Variables → Production** (projeto `mova-motochefe`, time MOVA) | `.env.prod.local`, só na máquina de quem opera a prod |
| Staging | **Bitwarden, coleção "MOVA staging"** | `.env.local` local; Vercel **Preview** (desde 2026-10-07; ver [`staging.md`](staging.md#app-na-vercel-preview)) |
| CI (GitHub Actions) | **Secrets do repo** `Meu-mova/moto-chefe` (Settings → Secrets and variables → Actions) | nenhuma |
| Credencial de integração por grupo ou loja | **Banco**. Cifradas com `src/lib/cripto.ts` (AES-256-GCM, chave `CERT_MASTER_KEY`): MCPAI, Nota Gateway, certificado A1. Bling, Kommo e fábrica: não há uso de `cripto.ts` em `bling.ts`, `kommo.ts` nem `fabrica-por-loja.ts` | nenhuma |

Secrets do GitHub:

| Secret | Para quê | Situação |
|---|---|---|
| `GITLEAKS_LICENSE` | job `gitleaks` do `ci.yml` (repo de organização exige licença) | cadastrado em 2026-10-05 |
| `CLAUDE_CODE_OAUTH_TOKEN` | workflow `Revisão por IA` (`claude-code-review.yml`, fase 8, D19); ver nota abaixo | cadastrado em 2026-10-07 |
| `STAGING_DATABASE_URL` | job `aplicar-staging` do `migracoes.yml` (fase 9): Session pooler (5432) do `mova-staging`, igual ao `.env.local` | cadastrado em 2026-10-07 |
| `SMOKE_SENHA` | workflow `Smoke do preview` (`smoke.yml`, fase 10): senha dos usuários sintéticos, igual à `SEED_SENHA` do staging | cadastrado em 2026-10-07 |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | `smoke.yml`: passa pela proteção da Vercel nos previews (Protection Bypass for Automation, nota "Smoke Playwright" no projeto). Revogar no painel ou pela API (`PATCH /v1/projects/<projeto>/protection-bypass` com `revoke`) | cadastrado em 2026-10-07 |

`CLAUDE_CODE_OAUTH_TOKEN`: token da assinatura do Luis, gerado com `claude setup-token`, válido
por 1 ano e consumindo a cota dela. Apagar o secret não invalida o token, e a doc do Claude Code
não mostra como revogá-lo. Como o `STAGING_DATABASE_URL`, quem tem push no repo consegue lê-lo
por um PR de branch do próprio repo. `401 Invalid bearer token` no workflow quer dizer que o
valor cadastrado não é aceito; recadastre colando o token numa linha só, sem espaços.

## Arquivos locais

Todos ignorados pelo git (`.env*` no `.gitignore`, exceto `.env.example`).

| Arquivo | O que tem | Quem tem |
|---|---|---|
| `.env.local` | **staging** (`mova-staging`) | toda máquina de desenvolvimento |
| `.env.prod.local` | **produção** | só quem opera a produção (hoje, o Luis) |

Convenção da D5 (plano de staging/CI), adotada em 2026-10-06, com uma mudança: o arquivo da
produção se chama `.env.prod.local`, e não `.env.production.local`, porque o Next carrega esse
segundo nome sozinho em `next build`/`next start`. O Cesar não desenvolve mais,
então a troca vale só para a máquina do Luis (situação em 2026-10-06). Até 2026-10-07 existia
também um `.env.staging.local`, cópia do `.env.local`; os scripts passaram a ler o `.env.local` e
ele pode ser apagado.

**Trocar numa máquina que ainda tem a produção no `.env.local`** (o primeiro comando para tudo se
já existir um `.env.prod.local`, para não sobrescrever nada):

```bash
[ -e .env.prod.local ] && echo "Já existe .env.prod.local: pare e confira" \
  || { mv .env.local .env.prod.local && cp .env.example .env.local; }
```

Depois preencha o bloco "Mínimo" do novo `.env.local` com os valores do staging (Bitwarden,
coleção "MOVA staging"; a nota de cada variável no `.env.example` diz de onde ela vem).

Conferir sem imprimir valores, pelo banner que o `sql.ts` mostra antes de tudo:
- `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select 1"` tem que
  mostrar `pulsqeymzsheasxsdnnk` (staging) e responder;
- `npx dotenv-cli -e .env.prod.local -- node --import tsx scripts/sql.ts --query "select 1"` tem
  que ser **recusado** por falta de `--prod`. A recusa prova que o arquivo é a produção.

Para rodar algo na produção, sempre explícito: `npx dotenv-cli -e .env.prod.local -- ...`. O
`sql.ts` e o `migrate.ts` exigem também `--prod`; os demais scripts não têm essa trava.

Nenhum script carrega o `.env.prod.local` sozinho. Os que miram a produção de propósito recebem o
arquivo explicitamente: o `schema-diff.ts` como argumento obrigatório; `upload-imagens-modelos.mjs`,
`backfill-*`, `arquivar-nfe-saida-bling` e `baixar-xmls-bling` pelo `-e` do comentário de uso. Os `db:*` do `package.json` seguem no `.env.local`, ou seja, no staging:
`db:generate`/`db:migrate` são proibidos, e o `db:studio` serve para inspecionar. O agente de conciliação
(`scripts/conciliacao/agente.ts`) roda no PC da loja, que tem o próprio `.env.local` apontando
para a produção: lá a convenção não muda.

## Regras

- Nunca imprimir, logar, commitar ou colar em chat o valor de um segredo, nem em mensagem de erro.
  Para conferir se uma variável existe, compare nome ou host, em booleano.
- Compartilhar só pelo Bitwarden. Nunca por WhatsApp, e-mail ou print com o valor visível.
- Credencial nova de integração vai para o banco, por grupo, cifrada com `cripto.ts`. Nunca env
  var global (ver AGENTS.md, "Multi-grupo").
- Alto poder (`CERT_MASTER_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`): vazou, rotaciona
  no mesmo dia. `CERT_MASTER_KEY` não pode simplesmente ser trocada: tudo que foi cifrado com ela
  precisa ser recifrado antes.
- URL de deploy hook da Vercel também é segredo: quem tem a URL publica. Revogar depois de usar.
- **Mudar o ambiente de uma variável na Vercel:** edite o alvo pela API
  (`vercel api /v9/projects/<projeto>/env/<id>?teamId=<time> -X PATCH` com `{"target": [...]}`);
  os outros ambientes ficam como estavam (testado em 2026-10-07, PR #32). O `id` sai de
  `vercel api /v10/projects/<projeto>/env?teamId=<time>` (lista sem valores). Não use
  `vercel env rm <nome> <ambiente>` para isso: não testamos se ele remove só aquele ambiente ou o
  registro inteiro, e valor `sensitive` apagado não volta.
- Integração no staging, se um teste precisar: analisar antes e cadastrar só no Preview, com
  credencial de teste.

## Divergências conhecidas (2026-10-06)

Comparação só por nome entre o painel da Vercel (Environment Variables, conferido por print em
2026-10-06) e o código da `dev`:

- **Na Vercel e sem uso no código** (busca por nome em `src/` e `scripts/` da `dev`):

  | Variável | Saiu do código em | Onde a credencial mora hoje |
  |---|---|---|
  | `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET` | `fc802b7` (2026-07-09), Bling por grupo | `bling_config`, por grupo |
  | `FABRICA_EMAIL`, `FABRICA_SENHA` | `6097094` (2026-08-05), "credencial sai do grupo e do ambiente" | por loja, no banco |
  | `VALIDAPIX_EMAIL`, `VALIDAPIX_PASSWORD` | `d00a4bc` (2026-07-01); ValidaPix removido na migração 0100 (2026-09-15) | não existe mais |
  | `TELEGRAM_ALLOWED_CHAT_ID` | `952c29a` (2026-08-10), "aposenta bot e disparos do telegram" | não existe mais |

  `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` também estão lá, mas o app não os lê desde
  `952c29a`; só `scripts/set-telegram-webhook.mjs` e `scripts/conciliacao/navegador.ts`.
  Credencial viva sem uso é risco sem benefício. Revisar e remover: Luis (Owner do time MOVA
  na Vercel desde 2026-10-06).
- ~~**Preview tem segredo de produção**~~: resolvido em 2026-10-07 (PR #32). As 15 credenciais
  de integração que estavam em "Production and Preview" ficaram só em Production, e o Preview
  passou a ter só as variáveis do staging ([`staging.md`](staging.md#app-na-vercel-preview)).
- **No código e fora da Vercel (usam fallback):** `NEXT_PUBLIC_APP_URL`/`MOVA_URL` (em
  Production os links de assinatura saem com `moto-chefe.vercel.app`; em Preview, com o host do
  deployment), `LEADS_EMAIL_TO`, `KOMMO_REDIRECT_URI`, `BLING_NATUREZA_OPERACAO`.

# Segredos e variáveis de ambiente

Onde cada segredo do MOVA mora, qual é a fonte da verdade e as regras de manuseio. A lista de
nomes, com o propósito de cada um, está em `.env.example`. Plano de origem:
`docs/seguranca/2026-10-01-plano-staging-ci.md` (D5, D8, §5.4–5.6).

## Onde mora cada coisa

| O quê | Fonte da verdade | Cópias permitidas |
|---|---|---|
| Produção | **Vercel → Environment Variables → Production** (projeto `mova-motochefe`) | `.env.local` na máquina de quem opera a prod (hoje; ver "Arquivos locais") |
| Staging | **Bitwarden, coleção "MOVA staging"** | `.env.staging.local` local; Vercel **Preview** quando a fase 6 sair |
| CI (GitHub Actions) | **Secrets do repo** `Meu-mova/moto-chefe` (Settings → Secrets and variables → Actions) | nenhuma |
| Credencial de integração por grupo ou loja | **Banco**. Cifradas com `src/lib/cripto.ts` (AES-256-GCM, chave `CERT_MASTER_KEY`): MCPAI, Nota Gateway, certificado A1. Bling, Kommo e fábrica: não há uso de `cripto.ts` em `bling.ts`, `kommo.ts` nem `fabrica-por-loja.ts` | nenhuma |

Secrets do GitHub:

| Secret | Para quê | Situação |
|---|---|---|
| `GITLEAKS_LICENSE` | job `gitleaks` do `ci.yml` (repo de organização exige licença) | cadastrado em 2026-10-05 |
| `CLAUDE_CODE_OAUTH_TOKEN` | revisão por IA em PR (fase 8, D19) | ainda não existe |
| `STAGING_DATABASE_URL`, usuário e senha do smoke | migração automática e smoke Playwright (fases 9 e 10, §5.6) | planejados |

## Arquivos locais

Todos ignorados pelo git (`.env*` no `.gitignore`, exceto `.env.example`).

| Arquivo | Hoje | Depois da D5 |
|---|---|---|
| `.env.local` | **produção** | staging |
| `.env.staging.local` | staging (`npm run dev:staging`) | some (vira o `.env.local`) |
| `.env.production.local` | não existe | produção, só para quem opera a prod |

A D5 troca arquivos na máquina de cada um; nenhum PR faz isso. Combinar com o Cesar antes:
muda o que o `npm run dev` dele mostra, e o que hoje aponta para `.env.local` passa a apontar
para o staging:

- caminho fixo no código: `scripts/upload-imagens-modelos.mjs`, `scripts/test-readonly.mjs`,
  o padrão de produção do `scripts/schema-diff.ts` (aceita argumento) e os `db:*` do
  `package.json`;
- só no comentário de uso (`dotenv -e .env.local`): `backfill-*`, `arquivar-nfe-saida-bling`,
  `conciliacao/agente.ts`. Basta trocar o `-e`.

O Next carrega `.env.production.local` sozinho em `next build`/`next start`, então `npm start`
local com esse arquivo presente fala com a prod.

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

## Divergências conhecidas (2026-10-06)

Comparação só por nome entre o painel da Vercel (Environment Variables, conferido por print em
2026-10-06) e o código da `dev`:

- **Na Vercel e sem uso no código:** `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`,
  `FABRICA_EMAIL`, `FABRICA_SENHA`, `VALIDAPIX_EMAIL`, `VALIDAPIX_PASSWORD`,
  `TELEGRAM_ALLOWED_CHAT_ID`. Credencial viva sem uso é risco sem benefício; remover depende do
  Cesar. `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` também estão lá, mas só scripts locais
  os leem.
- **Preview tem segredo de produção:** Resend, Telegram, Jarvis, Bling, fábrica, ValidaPix,
  WhatsApp (MCPAI) estão marcados "Production and Preview", sem Supabase nem `DATABASE_URL` no
  Preview. Pelo plano (§5.5), o Preview recebe os valores do staging e as integrações ficam
  vazias.
- **No código e fora da Vercel (usam fallback):** `NEXT_PUBLIC_APP_URL`/`MOVA_URL` (em
  Production os links de assinatura saem com `moto-chefe.vercel.app`; em Preview, com o host do
  deployment), `LEADS_EMAIL_TO`, `KOMMO_REDIRECT_URI`, `BLING_NATUREZA_OPERACAO`.

# 0003. CI do GitHub como portão, Vercel como entrega

- **Status:** Aceita
- **Data da decisão:** 2026-10-01
- **Fontes:** `docs/seguranca/2026-10-01-plano-staging-ci.md` (D6, D15, D18), `.github/workflows/ci.yml`,
  [Vercel: Deploying private Git repositories](https://vercel.com/docs/git#deploying-private-git-repositories)

## Contexto

Não havia CI: o `ci.yml` nasceu com o plano (PR #1). Todo push na `main` ia direto para a
produção. O `npm run build` pega erros de fronteira server/client que o `tsc` não pega
(`AGENTS.md`).

## Decisão

- **Portão:** o GitHub Actions roda em todo PR e push para `dev`/`main`:
  - checks que devem barrar o merge: `type-check`, `test`, `build`, `gitleaks`. Hoje nada
    impõe isso: os rulesets do GitHub (D11) ainda não existem;
  - só avisam: `knip` e `npm audit`;
  - não usa nenhum secret de aplicação.
- **Entrega:** a Vercel publica `main` em produção e as demais branches como Preview. O Preview
  aponta para o staging (D6, ainda não configurado).

## Por quê

Separar quem verifica de quem publica: o CI roda igual para qualquer autor e barra o merge; a
Vercel só entrega o que já passou. Não usar secret de aplicação no CI evita que um PR vaze
credencial.

## Alternativas descartadas

Não registradas na fonte.

## Situação em 2026-10-06

A Vercel está no plano Hobby. Pela doc da Vercel (link acima), o Hobby não faz deploy de
repositório privado de organização; ao reconectar o Git em 2026-10-06, o painel recusou com
essa mesma mensagem. Desde que o repo foi para `Meu-mova`, não há deploy automático. A decisão
continua valendo; a entrega depende do upgrade para Pro, em discussão com o Cesar.

## Quando revisar

Quando o Pro for contratado (reconectar o Git e tornar obrigatório o check da Vercel, D18), ou
se a hospedagem mudar.

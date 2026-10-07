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

- De manhã, o projeto estava num time Hobby. Pela doc da Vercel (link acima), o Hobby não faz
  deploy de repositório privado de organização. O painel recusou a reconexão com essa mesma
  mensagem, e desde a ida do repo para `Meu-mova` não havia deploy automático.
- À noite, o projeto foi transferido para o time **MOVA (Pro)**. Luis é Owner e Cesar é
  Billing. A reconexão funcionou, e um commit de PR gerou preview com sucesso.
- Ainda falta:
  - tornar o check da Vercel obrigatório (D18, via rulesets, fase 8);
  - apontar o Preview para o staging (D6, fase 6).
- **Rulesets bloqueados pelo plano do GitHub:** a org `Meu-mova` está no plano Free, e com o repo
  privado a API de proteção de branch e de rulesets responde 403 ("Upgrade to GitHub Pro or make
  this repository public"). O plano previa o Team. Até o Cesar decidir sobre a assinatura, os
  checks "que devem barrar o merge" só avisam, e o D11 e a fase 8 ficam sem caminho.

## Quando revisar

Se a hospedagem mudar, ou se o custo de uso no Pro (issue #15) pedir outra forma de entrega.

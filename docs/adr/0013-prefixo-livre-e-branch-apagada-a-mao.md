# 0013. Prefixo de branch = tipo do Conventional Commits; branch apagada à mão

- **Status:** Aceita
- **Data da decisão:** 2026-10-06
- **Fontes:** sessão de definição de convenções de GitHub com o Luis (2026-10-06), `CONTRIBUTING.md`
  ("Branches"); amplia o [0002](0002-branches-dev-main-e-revisao.md)

## Contexto

O [0002](0002-branches-dev-main-e-revisao.md) lista só `feat/*`, `fix/*` e `chore/*`, mas `docs/*`
já era usado (`docs/arquitetura`, `docs/context`, `docs/estrutura-adr`). O repo deixa
"apagar branch após o merge" desligado (`delete_branch_on_merge: false`), e não há proteção de
branch: com o repo privado na org Free, a API de rulesets responde 403
([0003](0003-ci-como-portao-vercel-como-entrega.md)).

## Decisão

- Branch de trabalho usa como prefixo qualquer tipo do Conventional Commits (`feat/`, `fix/`,
  `chore/`, `docs/`, `refactor/`...). O resto do [0002](0002-branches-dev-main-e-revisao.md) vale
  como está.
- "Apagar branch após o merge" fica **desligado**. Branch de trabalho se apaga à mão depois do
  merge.

## Por quê

- O prefixo repete o tipo do título do PR, que já segue Conventional Commits; lista fechada só
  gerava exceção.
- No PR `dev → main` a branch de origem é a própria `dev`. Sem proteção, a opção apagaria a `dev`
  no merge.

## Alternativas descartadas

Ligar a opção e recriar a `dev` quando fosse apagada: o risco cai justo no PR de release.

## Quando revisar

Quando houver proteção de branch na `dev` (rulesets, fase 8): aí a opção pode ser ligada.

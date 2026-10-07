# 0006. Revisão por IA no PR, com a assinatura do Claude

- **Status:** Aceita
- **Data da decisão:** 2026-10-01
- **Fontes:** `docs/seguranca/2026-10-01-plano-staging-ci.md` (§2, D19), `CONTRIBUTING.md` ("Revisão")

## Contexto

Com uma pessoa revisando, uma segunda leitura automática pega o que passa no cansaço: bug local,
null, caso de borda, padrão do repo.

## Decisão

- `claude-code-action@v1` com o plugin `code-review`, a cada push em PR para `dev`.
- Token `CLAUDE_CODE_OAUTH_TOKEN`, da assinatura do Luis (consome a cota dela, não a API).
- O comentário da IA é **insumo**: a revisão humana continua obrigatória nos casos de
  [0002](0002-branches-dev-main-e-revisao.md).
- Divisão de papéis:
  - a IA olha bug local, padrão, null, borda e legibilidade;
  - o humano olha design, regra de negócio, impacto no sistema e qualidade dos testes.

## Por quê

Custo marginal zero sobre uma assinatura que já existe, sem depender de produto pago por
assento.

## Alternativas descartadas

- **CodeRabbit:** grátis só para repo público; privado custa US$ 24/dev/mês.
- **Code Review gerenciado da Anthropic:** só nos planos Team/Enterprise, US$ 15–25 por revisão.

## Situação em 2026-10-06

Não implementada: o workflow e o secret `CLAUDE_CODE_OAUTH_TOKEN` ainda não existem (fase 8).

## Situação em 2026-10-07

- Workflow `.github/workflows/claude-code-review.yml`: plugin `code-review` com `--comment` nos
  PRs para a `dev` (o plugin pula rascunho, trivial e já revisado), `--max-turns 20`, e a
  divisão de papéis acima no system prompt.
- A action usa o token do próprio workflow (`github_token`), com escrita só em PR e issue, em vez
  do Claude GitHub App, que pediria escrita em workflows e actions.
- Os comentários saem como `github-actions[bot]`. Não verificado se o plugin os reconhece
  como "já revisado" para pular o PR no push seguinte.
- Token: validade, revogação e riscos em `docs/infra/segredos.md`.

## Quando revisar

Duas semanas depois de ligar, olhando a cota. Plano B: chave de API da empresa, com teto de
gasto. O token expira em um ano.

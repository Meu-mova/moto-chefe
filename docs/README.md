# Documentação do MOVA

Ponto de entrada da documentação. Para trabalhar no código, comece pelo
[`AGENTS.md`](../AGENTS.md) (regras que nasceram de incidentes) e pelo
[`CONTRIBUTING.md`](../CONTRIBUTING.md) (branches, PR, revisão).

## Decisões

- [`adr/`](adr/README.md): decisões de arquitetura (ADRs), com contexto, motivo e alternativas.

## Operação (runbooks)

- [`infra/staging.md`](infra/staging.md): o ambiente de staging (`mova-staging`), como criar,
  acessar e conferir.
- [`infra/backup-restore.md`](infra/backup-restore.md): backup da produção e como restaurar.
- [`infra/segredos.md`](infra/segredos.md): onde cada segredo mora e as regras de manuseio. A
  lista de variáveis está no [`.env.example`](../.env.example).

## Planos e segurança

- [`seguranca/2026-10-01-plano-staging-ci.md`](seguranca/2026-10-01-plano-staging-ci.md): plano
  de staging, fluxo `dev`/`main` e CI; origem dos ADRs 0001–0006.

## Histórico de funcionalidades

- [`superpowers/specs/`](superpowers/specs/): design de cada funcionalidade (o que e por quê),
  um arquivo por feature, com data.
- [`superpowers/plans/`](superpowers/plans/): plano de implementação de cada uma (como, passo a
  passo).

São registros do momento em que a feature foi feita; o código pode ter mudado depois.

## A caminho

Visão do produto (`produto/visao.md`), glossário do domínio (`CONTEXT.md`) e visão de
arquitetura (`arquitetura.md`).

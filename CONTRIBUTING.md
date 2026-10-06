# Como contribuir

Resumo do fluxo decidido em `docs/seguranca/2026-10-01-plano-staging-ci.md`. Em caso de
dúvida, aquele documento é a fonte — isto aqui é o resumo prático do dia a dia.

## Branches

- `main` = produção. `dev` = integração e staging.
- Trabalho novo nasce de `dev`: `feat/*`, `fix/*`, `chore/*`. PR para `dev`, merge por
  **squash**.
- `dev → main`: PR com **merge commit** (não squash), sempre que houver algo validado,
  no mínimo semanal. Lote pequeno e frequente evita que o release vire um pacotão.
- Hotfix: nasce de `main`, PR para `main`, depois PR `main → dev` para não perder o fix
  na próxima vez que `dev` for pra produção.
- Ninguém dá push direto em `dev` ou `main`, incluindo quem tem acesso de admin.

## Antes de abrir o PR

`npm run type-check` → `npm test` → `npm run build`. Fluxo com diálogo, Server Action ou
permissão: testar no navegador (preview do PR, que aponta para o staging) — ver `AGENTS.md`.

## Revisão

- PR do responsável técnico: CI verde é suficiente para merge (mais a revisão por IA,
  quando configurada — comentários dela servem de insumo, não bloqueiam).
- PR de qualquer outra pessoa: revisão do responsável técnico antes do merge.
- PR escrito por agente de IA (Claude Code ou similar) conta como PR de outra pessoa: o
  responsável técnico revisa no GitHub antes do merge (ADR 0002).
- IA revisa bug local, padrão, null, caso de borda, legibilidade. Humano revisa design,
  regra de negócio, impacto no sistema e qualidade dos testes.

## Tamanho de PR

Objetivo: manter as revisões (IA + humano) eficazes. A atenção do revisor cai bastante
acima de ~400 linhas, e a revisão por IA não muda isso.

**Tamanho**
- Alvo: até ~400 linhas de código de produção por PR.
- Acima de 500: permitido só com justificativa na descrição do PR (ex.: migração grande,
  remoção de código morto, feature que não dá pra dividir).
- O limite é um alerta, não um bloqueio. Não fatie PRs artificialmente em partes que não
  compilam ou não fazem sentido sozinhas.

**O que NÃO conta no limite**
- Testes (mas eles DEVEM ser revisados normalmente)
- Documentação
- Arquivos gerados (clients OpenAPI, snapshots, migrations automáticas)
- Lockfiles
- Renomeações/movimentações sem mudança de lógica

**Mais importante que o número**
- Cada PR deve ter uma única responsabilidade.
- Não misture refactor com mudança de comportamento: abra PRs separados.
- Para features grandes, use feature flags e integre em partes menores (mecanismo ainda
  não existe no projeto — ver pendência no plano, §3 D14).

## Commits

Conventional Commits, em inglês: `type(escopo opcional): descrição`. Tipos: `feat, fix,
docs, style, refactor, perf, test, build, ci, chore, revert`. Corpo só quando a mudança não
é óbvia pelo diff.

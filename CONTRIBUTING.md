# Como contribuir

Resumo do fluxo decidido em `docs/seguranca/2026-10-01-plano-staging-ci.md`. Em caso de
dúvida, aquele documento é a fonte — isto aqui é o resumo prático do dia a dia.

## Branches

- `main` = produção. `dev` = integração e staging.
- Trabalho novo nasce de `dev`, com o tipo do Conventional Commits como prefixo:
  `feat/*`, `fix/*`, `chore/*`, `docs/*`... PR para `dev`, merge por **squash**.
- `dev → main`: PR com **merge commit** (não squash), sempre que houver algo validado,
  no mínimo semanal. Lote pequeno e frequente evita que o release vire um pacotão. Cada
  promoção é uma release — ver "Issues, quadro e releases".
- Branch de trabalho se apaga à mão depois do merge. Não ligue "apagar branch após o merge"
  no repo: sem proteção de branch, ele apaga a `dev` no PR `dev → main` (ADR 0013).
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

## Issues, quadro e releases

Fonte única do "como" para issues, quadro, labels e releases; o porquê está nos ADRs
[0012](docs/adr/0012-versionamento-semver-e-releases.md) e
[0013](docs/adr/0013-prefixo-livre-e-branch-apagada-a-mao.md).

**Quadro.** O GitHub Project
[MOVA — Desenvolvimento](https://github.com/orgs/Meu-mova/projects/2) é onde o Cesar acompanha
o trabalho. Colunas: Backlog → Em andamento → Em revisão (PR aberto) → Pronto p/ subir (merge
na `dev`) → Em produção (saiu na release). Cada item tem **Módulo** (Comercial, Oficina,
Estoque, Financeiro, Gestão, Configuração, Fiscal, Integrações, Infra/Dev) e **Prioridade**
(Alta, Média, Baixa).

**Issues**
- Mudança com valor visível para o Cesar (feature, bug, mudança de fluxo) nasce de issue.
  `chore`, `docs` e refactor podem ir direto em PR.
- Uma issue por entrega que o Cesar reconhece. Tarefa técnica miúda vira checklist dentro da
  issue, não issue própria.
- Toda issue nasce com o **Luis como responsável** (os formulários já fazem isso).
- Título em português. Tipo pelo **Issue Type** (`Bug`, `Feature`, `Task`), não por label.
- Para quem não é dev, há dois formulários: "Algo quebrou" e "Pedido de melhoria".
- **Milestone** = uma entrega de negócio ("NF-e própria", "Agendamento público"). Data limite
  só quando houver prazo prometido.
- Issue que não vai ser feita fecha como **"not planned"** (com `wontfix` ou `duplicate`), nunca
  como "completed": só "completed" significa que chegou em produção.

**Labels.** Só estados transversais:

| Label | Quando |
|---|---|
| `needs-triage` | Ainda não avaliada |
| `needs-info` | Esperando informação de quem abriu |
| `ready-for-agent` | Especificada o bastante para um agente implementar sozinho |
| `ready-for-human` | Precisa de implementação humana |
| `wontfix` | Não vai ser feita |
| `duplicate` | Repetida de outra issue |
| `pr/grande` | PR acima de ~400 linhas de produção |

Não crie label nova sem combinar.

**PR e commits.** Cite a issue com **`Refs #N`** — na descrição do PR e nos commits. Nunca
`Closes`/`Fixes #N`: a issue só fecha no passo da release.

**Release.** Cada PR `dev → main` é uma release SemVer, a primeira é a `v1.0.0`. Hotfix também.
- Número: patch se só houver `fix`, `chore`, `docs`, `refactor`, `perf`, `build`, `ci`; minor
  se houver algum `feat`; major só por marco de negócio decidido pelo Luis e pelo Cesar.
- Passo a passo:
  1. Na `dev`, por PR, commit `chore(release): vX.Y.Z` atualizando o `version` do
     `package.json`.
  2. PR `dev → main` com merge commit (antes, `scripts/schema-diff.sh` sem diferença — plano de
     staging, §5).
  3. Tag `vX.Y.Z` no merge commit da `main`.
  4. GitHub Release com notas em português, para o Cesar: **Novidades**, **Correções**,
     **Interno**, cada item com o link da issue ou do PR. O rascunho pode ser de um agente; o
     Luis revisa antes de publicar.
  5. Fechar como "completed" as issues que entraram, com o comentário "Saiu na vX.Y.Z". O quadro
     as move para "Em produção".
- Hotfix: o bump (`chore(release)`, patch) vai na própria branch do hotfix, antes do PR para a
  `main`; depois os passos 3 a 5 e o PR `main → dev` de sempre.

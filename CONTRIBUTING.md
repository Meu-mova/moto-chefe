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
permissão: testar no navegador (preview do PR, que aponta para o staging e exige login da Vercel
como membro do time; ver `docs/infra/staging.md`) — ver `AGENTS.md`.

## Revisão

- PR do responsável técnico: CI verde é suficiente para merge, mais a leitura da revisão por
  IA (workflow `Revisão por IA`, nos PRs para a `dev`; o plugin pula rascunho, PR que julga
  trivial e PR que já revisou). Os comentários dela servem de insumo, não bloqueiam; se o check
  dela falhar (token, cota), não impede o merge, mas é sinal de que a revisão não aconteceu.
- O check `smoke do preview` entra e navega pelas telas principais no preview do PR, com
  usuários sintéticos. Vermelho ali é tela quebrada no staging: veja antes do merge.
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
- O workflow `Tamanho do PR` (`.github/workflows/pr-size.yml`) conta sozinho: acima de 400 põe
  a label `pr/grande` e comenta com os maiores arquivos. A regra do que conta está em
  `scripts/lib/tamanho-pr.ts`.

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
- **Milestone** = uma entrega de negócio ("NF-e própria", "Agendamento público"). A barra de
  progresso mostra quanto dela já está no ar, porque a issue só fecha em produção.
  - Só se cria quando a entrega tem 2+ issues, ou quando o Cesar pede para acompanhar algo.
  - Spec que vira várias tickets (`/to-spec` + `/to-tickets`): a spec e todas as tickets na
    mesma milestone.
  - Data limite só quando houver prazo prometido.
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
  2. PR `dev → main` com merge commit (antes, `scripts/schema-diff.ts` sem diferença — ver
     `docs/infra/staging.md`).
  3. Tag `vX.Y.Z` no merge commit da `main`.
  4. GitHub Release com notas em português, para o Cesar: **Novidades**, **Correções**,
     **Interno**, cada item com o link da issue ou do PR. O rascunho pode ser de um agente; o
     Luis revisa antes de publicar.
  5. Fechar como "completed" as issues que entraram, com o comentário "Saiu na vX.Y.Z". O quadro
     as move para "Em produção".
  6. Milestone cuja última issue entrou: fechar a milestone e pôr nas notas
     "✅ Entrega concluída: <nome>".
- Hotfix: o bump (`chore(release)`, patch) vai na própria branch do hotfix, antes do PR para a
  `main`; depois os passos 3 a 6 e o PR `main → dev` de sempre.

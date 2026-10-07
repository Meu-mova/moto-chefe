# Issue tracker: GitHub

Issues e specs deste repo são issues do GitHub (`Meu-mova/moto-chefe`), acompanhadas no Project
[MOVA — Desenvolvimento](https://github.com/orgs/Meu-mova/projects/2) (número `2`, dono
`Meu-mova`). Use o `gh` para tudo. As regras para pessoas estão no `CONTRIBUTING.md` ("Issues,
quadro e releases"); aqui fica só o que os agentes executam.

## Operações

- **Criar**: `gh issue create --title "..." --body "..." --type <Bug|Feature|Task> --assignee LuisCarlos01 --label <estado> --project "MOVA — Desenvolvimento"`.
  Corpo longo por heredoc. Toda issue nasce com o Luis (`LuisCarlos01`) como responsável.
  Estado: `needs-triage` por padrão; `ready-for-agent` quando a skill mandar (`/to-spec`,
  `/to-tickets`). Depois, no Project, preencha Status (`Backlog`), Módulo e Prioridade com
  `gh project item-edit` (opções em `gh project field-list 2 --owner Meu-mova`).
- **Ler**: `gh issue view <n> --comments`.
- **Listar**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`,
  com `--label` e `--state` conforme o caso.
- **Comentar**: `gh issue comment <n> --body "..."`.
- **Labels**: `gh issue edit <n> --add-label "..."` / `--remove-label "..."`.
- **Fechar**: só no passo da release (`--reason completed`, comentário "Saiu na vX.Y.Z") ou como
  não planejada (`gh issue close <n> --reason "not planned" --comment "..."`).

## Regras deste repo

- Título e corpo em português.
- Tipo pelo Issue Type, nunca por label. Não crie labels fora da tabela do `CONTRIBUTING.md`.
- Uma issue por entrega que o Cesar reconhece; tarefa técnica miúda vira checklist na issue.
- Milestone: só anexe se já existir; não crie sem OK do usuário.
- PR e commits citam `Refs #N`, nunca `Closes #N`.

## Pull requests como superfície de triagem

**PRs as a request surface: no.** _(Mude para `yes` se o repo passar a tratar PRs externos como
pedidos; o `/triage` lê esta linha.)_

## Quando uma skill disser "publish to the issue tracker"

Crie a issue com Issue Type e no Project (ver "Operações").

## Quando uma skill disser "fetch the relevant ticket"

`gh issue view <n> --comments`.

## Wayfinding

Não configurado neste repo: não há labels `wayfinder:*`. Antes de usar `/wayfinder`, combine
com o usuário.

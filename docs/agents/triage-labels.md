# Labels de triagem

As skills falam em papéis de categoria e de estado. Este arquivo liga cada papel ao que o repo usa.

## Categoria = Issue Type, não label

O `/triage` pede uma categoria (`bug` ou `enhancement`) em cada issue. Aqui a categoria é o
**Issue Type** da issue, nunca label — não crie as labels `bug` nem `enhancement`:

| Categoria nas skills | Issue Type | Comando |
| -------------------- | ---------- | ------- |
| `bug`                | `Bug`      | `gh issue edit <n> --type Bug` |
| `enhancement`        | `Feature`  | `gh issue edit <n> --type Feature` |
| (nenhuma das duas: investigação, infra, dívida) | `Task` | `gh issue edit <n> --type Task` |

## Estado

| Papel nas skills (mattpocock) | Label no repo | Significado |
| ----------------------------- | ------------------- | ---------------------------------------- |
| `needs-triage`                | `needs-triage`      | Ainda não avaliada |
| `needs-info`                  | `needs-info`        | Esperando informação de quem abriu |
| `ready-for-agent`             | `ready-for-agent`   | Especificada para um agente implementar sozinho |
| `ready-for-human`             | `ready-for-human`   | Precisa de implementação humana |
| `wontfix`                     | `wontfix`           | Não vai ser feita |

Quando uma skill citar um papel (ex.: "apply the AFK-ready triage label"), use a label desta
tabela. A lista completa de labels do repo está no `CONTRIBUTING.md`.

@AGENTS.md

## Issues, quadro e releases

Regras em `CONTRIBUTING.md` ("Issues, quadro e releases"); o porquê nos ADRs 0012 e 0013. O que
mais se erra:

- Mudança com valor visível para o Cesar **nasce de issue** e entra no Project com Módulo e
  Prioridade. Tarefa miúda vira checklist dentro da issue.
- Tipo da issue é o **Issue Type**, não label. Só as labels da tabela do `CONTRIBUTING.md`; nova,
  só combinando com o Luis.
- PR e commits citam **`Refs #N`, nunca `Closes #N`**: a issue só fecha no passo da release.
- **Toda promoção `dev → main` é uma release SemVer.** Nunca promova sem seguir o passo da
  release.
- Não ligue "apagar branch após o merge" no repo: sem proteção de branch, isso apaga a `dev`.

## Agent skills

### Issue tracker

GitHub Issues + Project "MOVA — Desenvolvimento". Ver `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário padrão (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Ver `docs/agents/triage-labels.md`.

### Domain docs

Contexto único (`CONTEXT.md` + `docs/adr/`). Ver `docs/agents/domain.md`.

@AGENTS.md

## Issues, quadro e releases

Passo a passo em `CONTRIBUTING.md` ("Issues, quadro e releases"); o porquê no ADR 0012. O que
mais se erra:

- Mudança com valor visível para o Cesar (feature, bug, fluxo) **nasce de issue** e entra no
  Project "MOVA — Desenvolvimento" com Módulo e Prioridade. `chore`/`docs`/refactor podem ir
  direto em PR.
- Tipo da issue é o **Issue Type** (`Bug`/`Feature`/`Task`), não label. Não crie label nova sem
  combinar com o Luis.
- PR para `dev` cita **`Refs #N`, nunca `Closes #N`**: a issue só fecha quando chega em
  produção, no passo da release.
- **Toda promoção `dev → main` é uma release SemVer** (tag + GitHub Release com notas em
  português). Nunca promova sem seguir o passo da release.
- Não ligue "apagar branch após o merge" no repo: sem proteção de branch, isso apaga a `dev`.

## Agent skills

### Issue tracker

GitHub Issues + Project "MOVA — Desenvolvimento" (org `Meu-mova`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.

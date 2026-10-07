@AGENTS.md

## Issues, quadro e releases

Regras em `CONTRIBUTING.md` ("Issues, quadro e releases"); o porquê nos ADRs 0012 e 0013. O que
mais se erra:

- Mudança com valor visível para o Cesar **nasce de issue**, com o Luis (`LuisCarlos01`) como
  responsável, e entra no Project com Módulo e Prioridade. Tarefa miúda vira checklist dentro da issue.
- Tipo da issue é o **Issue Type**, não label. Só as labels da tabela do `CONTRIBUTING.md`; nova,
  só combinando com o Luis.
- PR e commits citam **`Refs #N`, nunca `Closes #N`**: a issue só fecha no passo da release.
- **Toda promoção `dev → main` é uma release SemVer.** Nunca promova sem seguir o passo da
  release.
- Não ligue "apagar branch após o merge" no repo: sem proteção de branch, isso apaga a `dev`.

## Vercel CLI

- **Nunca rode `vercel env pull` sem informar o arquivo de destino.** Sem arquivo, ele sobrescreve
  o `.env.local` (o staging) com o ambiente Development da Vercel (sem nenhuma variável em
  2026-10-07). Para conferir algo, use um arquivo descartável fora do git e não imprima valores.
- Mudar o ambiente de uma variável: pela API, como em `docs/infra/segredos.md` ("Regras"); não
  com `vercel env rm`.

## Agent skills

### Issue tracker

GitHub Issues + Project "MOVA — Desenvolvimento". Ver `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário padrão (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Ver `docs/agents/triage-labels.md`.

### Domain docs

Contexto único (`CONTEXT.md` + `docs/adr/`). Ver `docs/agents/domain.md`.

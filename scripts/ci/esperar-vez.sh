#!/usr/bin/env bash
# Fila sem perda para jobs que batem no staging (#594): espera enquanto uma execução mais
# antiga (run_id menor) deste workflow tiver o job de mesmo nome ainda não concluído.
# Substitui o pending único do concurrency do GitHub, que cancelava o job do PR do lado.
#   GH_TOKEN=... scripts/ci/esperar-vez.sh "<nome do job>"
set -euo pipefail
job="$1"
limite=$(( $(date +%s) + 60 * 60 ))
while :; do
  frente=""
  for run in $(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/navegacao.yml/runs?per_page=100" \
      --jq "[.workflow_runs[] | select(.status != \"completed\" and .id < $GITHUB_RUN_ID) | .id] | sort | .[]"); do
    jobs=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run/jobs")
    estado=$(jq -r --arg j "$job" '[.jobs[] | select(.name == $j)] | if length == 0 then "sem-job" else .[0].status end' <<<"$jobs")
    [ "$estado" = "completed" ] && continue
    # Sem o job: pula só se o filtro já concluiu (job pulado); execução na fila sem job
    # nenhum conta como na frente.
    filtro=$(jq -r '[.jobs[] | select(.name == "mexe em tela?")][0].status // "queued"' <<<"$jobs")
    if [ "$estado" = "sem-job" ] && [ "$filtro" = "completed" ]; then continue; fi
    frente=$run; break
  done
  if [ -z "$frente" ]; then echo "Vez desta execução; seguindo."; exit 0; fi
  if [ "$(date +%s)" -ge "$limite" ]; then
    echo "::error::Esperou 60 min pelo job \"$job\" da execução $frente sem terminar. Rode de novo quando ela acabar."
    exit 1
  fi
  echo "$(date -u +%H:%M:%S) Esperando \"$job\" da execução na frente: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$frente"
  sleep 30
done

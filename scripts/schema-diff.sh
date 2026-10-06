#!/usr/bin/env bash
# Compara o schema `public` do staging com o da produção. Rode antes de cada
# PR dev → main: diferença significa migração aplicada num banco e não no outro.
#
# Uso: scripts/schema-diff.sh [env do staging] [env da produção]
#      padrão: .env.staging.local e .env.local (até a fase 7; depois .env.production.local)
# Precisa de pg_dump 17 (brew install postgresql@17).
set -euo pipefail

ENV_STAGING="${1:-.env.staging.local}"
ENV_PROD="${2:-.env.local}"
PG_DUMP="${PG_DUMP:-$(command -v pg_dump || echo /opt/homebrew/opt/postgresql@17/bin/pg_dump)}"

# Lê a DATABASE_URL do arquivo sem ecoar nada; troca para a porta 5432 porque
# o pooler de transação (6543) não aceita pg_dump.
url_de() {
  node -e '
    try {
      const l = require("fs").readFileSync(process.argv[1], "utf8").split("\n").find(x => x.startsWith("DATABASE_URL="));
      const u = new URL(l.slice(13).trim().replace(/^["\x27]|["\x27]$/g, ""));
      u.port = "5432"; u.search = "";
      process.stdout.write(u.toString());
    } catch { console.error("Não consegui ler DATABASE_URL de " + process.argv[1]); process.exit(1) }
  ' "$1"
}

# Tira o que muda a cada dump sem ser schema: chave do \restrict e versões no cabeçalho.
normalizar() {
  grep -v -E '^\\(un)?restrict |^-- Dumped (from|by) ' | sed -e 's/[[:space:]]*$//'
}

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT

"$PG_DUMP" "$(url_de "$ENV_STAGING")" --schema-only --no-owner --no-privileges --schema=public | normalizar > "$dir/staging.sql"
"$PG_DUMP" "$(url_de "$ENV_PROD")" --schema-only --no-owner --no-privileges --schema=public | normalizar > "$dir/producao.sql"

if diff -u "$dir/staging.sql" "$dir/producao.sql" > "$dir/diff.txt"; then
  echo "Schemas iguais (public)."
else
  cat "$dir/diff.txt"
  echo
  echo "Schemas DIFERENTES — linhas com '-' só no staging, com '+' só na produção."
  exit 1
fi

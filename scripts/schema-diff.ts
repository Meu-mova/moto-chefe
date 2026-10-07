/**
 * Compara o schema `public` do staging com o da produção. Rode antes de cada
 * PR dev → main: diferença significa migração aplicada num banco e não no outro.
 *
 * Uso: node --import tsx scripts/schema-diff.ts [env do staging] [env da produção]
 *      padrão: .env.staging.local e .env.prod.local
 * Precisa de pg_dump 17 (brew install postgresql@17).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { descreverAlvo, REF_PRODUCAO, rotuloAlvo } from './lib/alvo-banco'

const [envStaging = '.env.staging.local', envProducao = '.env.prod.local'] = process.argv.slice(2)
const PG_DUMP = process.env.PG_DUMP
  ?? (existsSync('/opt/homebrew/opt/postgresql@17/bin/pg_dump') ? '/opt/homebrew/opt/postgresql@17/bin/pg_dump' : 'pg_dump')

function urlDe(arquivoEnv: string): string {
  let url: string | undefined
  try {
    url = parseEnv(readFileSync(arquivoEnv, 'utf8')).DATABASE_URL
  } catch {
    // Sem detalhes do erro: o conteúdo do arquivo é segredo.
  }
  if (!url) {
    console.error(`Não achei DATABASE_URL em ${arquivoEnv}`)
    process.exit(1)
  }
  return url
}

const urlStaging = urlDe(envStaging)
const urlProducao = urlDe(envProducao)
const alvoStaging = descreverAlvo(urlStaging)
const alvoProducao = descreverAlvo(urlProducao)
console.error(`staging  → ${rotuloAlvo(alvoStaging)}`)
console.error(`produção → ${rotuloAlvo(alvoProducao)}`)

// Comparar um banco com ele mesmo daria "iguais" sem erro — o risco real quando
// alguém passa um arquivo de produção no lugar do de staging.
if (alvoStaging.ehProducao) {
  console.error(`${envStaging} não aponta para o staging.`)
  process.exit(1)
}
if (alvoProducao.ref !== REF_PRODUCAO) {
  console.error(`${envProducao} não aponta para a produção (${REF_PRODUCAO}).`)
  process.exit(1)
}

/** Dump schema-only do public. A senha vai pelo ambiente do pg_dump, não pela linha de comando (visível no `ps`). */
function dump(databaseUrl: string): string {
  const u = new URL(databaseUrl)
  const r = spawnSync(PG_DUMP, [
    '--schema-only', '--no-owner', '--no-privileges', '--schema=public',
    // 5432: o pooler de transação (6543) não aceita pg_dump.
    '--host', u.hostname, '--port', '5432',
    '--username', decodeURIComponent(u.username), '--dbname', u.pathname.slice(1) || 'postgres',
  ], {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) {
    console.error(`pg_dump falhou em ${u.hostname}:\n${r.stderr ?? r.error?.message ?? ''}`)
    process.exit(1)
  }
  // Tira o que muda a cada dump sem ser schema: chave do \restrict e versões no cabeçalho.
  return r.stdout
    .split('\n')
    .filter(l => !/^\\(un)?restrict |^-- Dumped (from|by) /.test(l))
    .map(l => l.trimEnd())
    .join('\n')
}

const dir = mkdtempSync(join(tmpdir(), 'schema-diff-'))
try {
  const arqStaging = join(dir, 'staging.sql')
  const arqProducao = join(dir, 'producao.sql')
  writeFileSync(arqStaging, dump(urlStaging))
  writeFileSync(arqProducao, dump(urlProducao))

  const diff = spawnSync('diff', ['-u', arqStaging, arqProducao], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (diff.status === 0) {
    console.log('Schemas iguais (public).')
  } else {
    console.log(diff.stdout)
    console.log("Schemas DIFERENTES — linhas com '-' só no staging, com '+' só na produção.")
    process.exitCode = 1
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

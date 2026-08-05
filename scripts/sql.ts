/**
 * Roda SQL avulso contra a DATABASE_URL — o caminho de migração deste repo.
 *
 * `drizzle-kit migrate` não roda aqui: o journal em src/lib/db/migrations/meta
 * está quebrado desde a fusão multi-grupo. Então a migração é SQL escrito à mão
 * e aplicado por aqui.
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0039_algo.sql
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select 1"
 *
 * O caminho de --file é relativo a src/lib/db/migrations.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

const [modo, valor] = process.argv.slice(2)

if ((modo !== '--file' && modo !== '--query') || !valor) {
  console.error('Uso: scripts/sql.ts --file <arquivo.sql> | --query "<sql>"')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida — rode via `npx dotenv-cli -e .env.local -- ...`')
  process.exit(1)
}

const texto = modo === '--file'
  ? readFileSync(resolve(process.cwd(), 'src/lib/db/migrations', valor), 'utf8')
  : valor

// max:1 e prepare:false — script avulso, e o pooler Supavisor não aceita prepared.
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

async function main() {
  // .simple() permite várias instruções num arquivo só; o Postgres trata o lote
  // como uma transação implícita, então ou passa tudo ou não passa nada.
  const linhas = await sql.unsafe(texto).simple()
  if (Array.isArray(linhas) && linhas.length > 0) {
    console.log(JSON.stringify(linhas, null, 1))
  } else {
    console.log('OK — sem linhas de retorno')
  }
  await sql.end()
}

main().catch(async (e: unknown) => {
  console.error('FALHOU:', e instanceof Error ? e.message : String(e))
  await sql.end({ timeout: 5 })
  process.exit(1)
})

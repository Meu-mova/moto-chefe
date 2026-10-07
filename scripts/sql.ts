/**
 * Roda SQL avulso (consulta ou arquivo) contra a DATABASE_URL.
 *
 * Não é o caminho de migração: migração nova vai pelo scripts/migrate.ts, que
 * anota em schema_migrations o que rodou em cada banco. Por isso --file recusa
 * a produção mesmo com --prod: lá, arquivo de migração só entra anotado.
 *
 * Uso:
 *   npx dotenv-cli -e .env.staging.local -- node --import tsx scripts/sql.ts --query "select 1"
 *   npx dotenv-cli -e .env.prod.local -- node --import tsx scripts/sql.ts --query "select 1" --prod
 *
 * Imprime o banco antes de tudo e recusa a produção sem --prod.
 * O caminho de --file é relativo a src/lib/db/migrations.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { exigirAlvoPermitido } from './lib/alvo-banco'

const args = process.argv.slice(2)
const temProd = args.includes('--prod')
const [modo, valor] = args.filter(a => a !== '--prod')

if ((modo !== '--file' && modo !== '--query') || !valor) {
  console.error('Uso: scripts/sql.ts --file <arquivo.sql> | --query "<sql>"  [--prod]')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida — rode via `npx dotenv-cli -e <arquivo .env> -- ...`')
  process.exit(1)
}

const alvo = exigirAlvoPermitido(process.env.DATABASE_URL, temProd)
if (modo === '--file' && alvo.ehProducao) {
  console.error('Na produção, arquivo de migração entra pelo scripts/migrate.ts --aplicar --prod, que anota em schema_migrations.')
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

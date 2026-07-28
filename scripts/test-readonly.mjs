// Prova que, dentro da transacao read-only, uma ESCRITA e' recusada pelo Postgres
// (mesmo que a validacao de string fosse burlada). Rodar: node scripts/test-readonly.mjs
import { config } from 'dotenv'
config({ path: '.env.local' }) // Next.js guarda os envs em .env.local
import postgres from 'postgres'

const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false })
try {
  await client.begin(async (tx) => {
    await tx.unsafe('SET LOCAL transaction_read_only = on')
    await tx.unsafe('CREATE TEMP TABLE _jarvis_ro_test (x int)') // escrita
  })
  console.log('FALHA: a escrita NAO foi bloqueada')
  process.exit(1)
} catch (e) {
  if (/read-only|somente leitura|cannot execute/i.test(e.message)) {
    console.log('OK: escrita bloqueada pela transacao read-only ->', e.message.slice(0, 80))
    process.exit(0)
  }
  console.log('ERRO inesperado:', e.message)
  process.exit(1)
} finally {
  await client.end()
}

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle> | undefined
}

const client = postgres(process.env.DATABASE_URL!, {
  max: 2,          // serverless: 1-2 conexões por instância — o pooler gerencia o resto
  prepare: false,  // obrigatório para Supabase transaction-mode pooler
  idle_timeout: 10,
  connect_timeout: 10,
})

export const db = globalThis.__db ?? (globalThis.__db = drizzle(client, { schema }))

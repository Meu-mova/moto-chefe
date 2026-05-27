import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle> | undefined
}

const client = postgres(process.env.DATABASE_URL!, {
  max: 10,
  prepare: false, // required for Supabase transaction-mode pooler (PgBouncer/Supavisor)
})

export const db = globalThis.__db ?? (globalThis.__db = drizzle(client, { schema }))

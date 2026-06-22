import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle> | undefined
}

const client = postgres(process.env.DATABASE_URL!, {
  max: 5,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 15,
})

export const db = globalThis.__db ?? (globalThis.__db = drizzle(client, { schema }))

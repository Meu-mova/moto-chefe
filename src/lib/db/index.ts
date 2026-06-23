import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle> | undefined
}

function makeClient() {
  return postgres(process.env.DATABASE_URL!, {
    max: 8,
    prepare: false,
    fetch_types: false,
    idle_timeout: 20,
    max_lifetime: 120,
    connect_timeout: 10,
  })
}

export const db = globalThis.__db ?? (globalThis.__db = drizzle(makeClient(), { schema }))

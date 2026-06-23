import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle> | undefined
}

function makeClient() {
  return postgres(process.env.DATABASE_URL!, {
    max: 2,
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60,
    connect_timeout: 15,
  })
}

export const db = globalThis.__db ?? (globalThis.__db = drizzle(makeClient(), { schema }))

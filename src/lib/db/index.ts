import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  idle_timeout: 10,
  max_lifetime: 60,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })

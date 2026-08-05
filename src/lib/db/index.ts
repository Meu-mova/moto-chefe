import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { attachDatabasePool } from '@vercel/functions'
import postgres from 'postgres'
import type { SQL } from 'drizzle-orm'
import * as schema from './schema'

// ─── Pool principal: node-postgres (pg) + attachDatabasePool ───────────────────
// Driver `pg` (não postgres.js) para poder usar o attachDatabasePool OFICIAL da
// Vercel. Ele gerencia o ciclo do Fluid Compute: libera as conexões antes da
// instância suspender, em vez de deixá-las congeladas em `active/ClientRead`
// segurando o pooler — que era o que travava /folha e /estoque (confirmado em
// pg_stat_activity: query presa 84-99s). O attachDatabasePool NÃO suporta
// postgres.js, por isso a troca. Ver memória project-conexao-banco.
//
// `pg` funciona com o pooler Supavisor (6543, transaction mode): protocolo
// estendido com statements sem nome, aceito pelo pooler (testado antes de trocar).
const globalForDb = globalThis as unknown as {
  __pgPool?: Pool
  __pgClient?: ReturnType<typeof postgres>
}

const pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
  })
globalForDb.__pgPool = pool
attachDatabasePool(pool)

export const db = drizzle(pool, { schema })

// drizzle-orm/node-postgres: db.execute() retorna { rows } em runtime, mas o TIPO
// do drizzle diz array — descompasso conhecido. Este helper devolve as linhas
// (array), como o postgres.js fazia, mantendo os call sites de SQL cru simples.
export async function execRows(query: SQL): Promise<any[]> {
  const res = (await db.execute(query)) as unknown as { rows: any[] }
  return res.rows
}

// ─── postgres.js: só para o Jarvis ─────────────────────────────────────────────
// O Jarvis (consulta read-only por linguagem natural e a rota de schema) usa a API
// de tagged-template do postgres.js (`client.begin`, `client\`...\``), que o `pg`
// não tem. Pool pequeno e separado — read-only e de baixo tráfego.
export const client =
  globalForDb.__pgClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 2,
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60,
    connect_timeout: 15,
  })
globalForDb.__pgClient = client

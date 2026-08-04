import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Pool endurecido para o serverless/Fluid da Vercel + pooler Supavisor (6543).
//
// `max_lifetime` é o que evita "conexões estantadas": quando um worker da Vercel
// congela no meio de um request, a conexão é fechada depois de 60s em vez de
// ficar presa segurando um backend do pooler. Era essa regressão (o pool tinha
// voltado para max:10 SEM max_lifetime) que travava a Folha de Pagamento — a
// página mais pesada, que dispara ~13 consultas de uma vez — até o timeout de
// 300s. `max` baixo evita que um worker acumule muitas conexões.
//
// NÃO subir `max` nem remover `max_lifetime`/o cache global sem motivo forte.
// Ver memória project-conexao-banco e o incidente da folha (2026-08-04).
const globalForDb = globalThis as unknown as { __dbClient?: ReturnType<typeof postgres> }

export const client =
  globalForDb.__dbClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 3,
    prepare: false,      // obrigatório para o pooler Supavisor (transaction mode)
    idle_timeout: 20,
    max_lifetime: 60,    // recicla conexões; worker congelado não segura backend
    connect_timeout: 15,
  })

// Cache do pool no worker: não recria pool a cada avaliação do módulo.
globalForDb.__dbClient = client

export const db = drizzle(client, { schema })

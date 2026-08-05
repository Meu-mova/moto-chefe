import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { waitUntil } from '@vercel/functions'
import * as schema from './schema'

// Pool para o serverless/Fluid da Vercel + pooler Supavisor (6543, transaction mode).
//
// Duas coisas importam, e as duas já foram causa de incidente:
//  - `max_lifetime`: recicla a conexão após 60s. Sem ele, worker da Vercel que
//    congela segura a conexão indefinidamente e o pool esgota (incidente da folha,
//    2026-08-04). NUNCA remover.
//  - `max` NÃO pode ser baixo demais. O pooler é transaction mode: o Supavisor
//    multiplexa muitas conexões de cliente sobre poucos backends, então `max` alto
//    do lado do cliente é seguro (não é conexão direta). Com `max:3`, uma instância
//    reutilizada pelo Fluid cujas 3 conexões ficaram presas em ClientRead trava
//    TODA query nova até o timeout — foi o que travou o /estoque em 2026-08-05.
//    10 dá folga para a instância seguir servindo mesmo com algumas presas.
//
// Ver memória project-conexao-banco. Mexer aqui só com evidência de pg_stat_activity.
const globalForDb = globalThis as unknown as { __dbClient?: ReturnType<typeof postgres> }

export const client =
  globalForDb.__dbClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 10,
    prepare: false,      // obrigatório para o pooler Supavisor (transaction mode)
    idle_timeout: 10,    // fecha conexão ociosa em 10s (curto, para fechar antes da suspensão do Fluid)
    max_lifetime: 60,    // recicla conexões; worker congelado não segura backend pra sempre
    connect_timeout: 15,
  })

// Cache do pool no worker: não recria pool a cada avaliação do módulo.
globalForDb.__dbClient = client

export const db = drizzle(client, { schema })

// ─── Keep-alive contra o congelamento do Fluid Compute ─────────────────────────
// O Fluid suspende a instância entre requests (e durante I/O), congelando conexões
// do postgres.js em `active/ClientRead` — foi o que travava /folha e /estoque
// (confirmado em pg_stat_activity: query presa 84-99s esperando o cliente
// congelado ler). O `attachDatabasePool` oficial da Vercel resolve isso, mas só
// suporta pg/mysql/mongo/redis, NÃO postgres.js.
//
// keepDbAlive replica o efeito: registra um waitUntil que segura a instância viva
// por ~12s após ser chamada, dando tempo do idle_timeout (10s) FECHAR as conexões
// ociosas antes da suspensão — em vez de deixá-las congeladas segurando o pooler.
// Chamado no getUsuarioLogado, que roda no início de todo request de página.
export function keepDbAlive() {
  try {
    waitUntil(new Promise<void>((resolve) => setTimeout(resolve, 12_000)))
  } catch {
    // Fora de um contexto de request (build local, scripts): ignora.
  }
}

import type { Pool } from 'pg'

// Diagnóstico de lentidão (#128): lê o pool que src/lib/db/index.ts já publica em globalThis,
// sem mexer nesse arquivo. waiting > 0 significa consulta esperando conexão livre (max: 10).
export function estadoDoPool(): string {
  const pool = (globalThis as unknown as { __pgPool?: Pool }).__pgPool
  if (!pool) return 'pool=ausente'
  return `pool_total=${pool.totalCount} pool_ociosas=${pool.idleCount} pool_esperando=${pool.waitingCount}`
}

// Um log por etapa, assim que ela termina: se a função morrer no limite, o log mostra onde parou.
export function criarMedidor(rotulo: string) {
  const inicio = performance.now()
  return (etapa: string, desde = inicio) =>
    console.log(`[${rotulo}]`, `etapa=${etapa} ms=${Math.round(performance.now() - desde)} ${estadoDoPool()}`)
}

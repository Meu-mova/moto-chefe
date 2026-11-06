import { client } from '@/lib/db'
import { criarFila } from '@/lib/limitar-concorrencia'

// O pooler do Supabase em modo transaction (6543) trava quando o postgres.js manda várias
// consultas na mesma conexão sem esperar a resposta (Supavisor #1239; #701). Com no máximo
// uma consulta por conexão isso não acontece: a fila tem o tamanho do `max` do próprio `client`.
// A vaga não se solta por tempo: soltar traria o pipelining de volta. Consulta que o pooler
// deixar sem resposta segura a vaga até a instância reciclar, e as outras desistem na espera.
const ESPERA_MAX_MS = 10_000

const naFila = criarFila(client.options.max, ESPERA_MAX_MS)

/** Único jeito de usar o `client` (postgres.js) no Jarvis. */
export function comClientJarvis<T>(uso: (c: typeof client) => Promise<T>): Promise<T> {
  return naFila(() => uso(client))
}

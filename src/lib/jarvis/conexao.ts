import { client } from '@/lib/db'
import { criarFila } from '@/lib/limitar-concorrencia'

// O pooler do Supabase em modo transaction (6543) trava quando o postgres.js manda várias
// consultas na mesma conexão sem esperar a resposta (Supavisor #1239; #701). Com no máximo
// uma consulta por conexão isso não acontece: o limite é o `max: 2` do `client` em src/lib/db.
const CONEXOES_DO_CLIENT = 2
const ESPERA_MAX_MS = 10_000

const naFila = criarFila(CONEXOES_DO_CLIENT, ESPERA_MAX_MS)

/** Único jeito de usar o `client` (postgres.js) no Jarvis. */
export function comClientJarvis<T>(uso: (c: typeof client) => Promise<T>): Promise<T> {
  return naFila(() => uso(client))
}

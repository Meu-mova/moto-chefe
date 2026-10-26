import { VALIDADE_LINK_DIAS } from '@/lib/notas-contador'

// Zips do "Enviar ao contador" que foram por link (#402): uma pasta por grupo.
export const BUCKET_CONTADOR = 'notas-contador'

/** Forma conferida no staging (26/10): StorageApiError, statusCode 404, "Bucket not found". O resto (rede, 5xx) é falha. */
export function bucketInexistente(erro: { statusCode?: unknown; message?: string }): boolean {
  return String(erro.statusCode) === '404' || /bucket not found/i.test(erro.message ?? '')
}

type Objeto = { name: string; id: string | null; created_at: string | null }

/** O bucket entra por parâmetro: o Storage não existe no Postgres do CI. `listar` lança erro se a listagem falhar. */
export type ArmazemZips = {
  listar(pasta: string, offset: number, limite: number): Promise<Objeto[]>
  remover(caminhos: string[]): Promise<void>
}

const PAGINA = 100

async function listarTudo(a: ArmazemZips, pasta: string): Promise<Objeto[]> {
  const todos: Objeto[] = []
  for (let offset = 0; ; offset += PAGINA) {
    const pagina = await a.listar(pasta, offset, PAGINA)
    todos.push(...pagina)
    if (pagina.length < PAGINA) return todos
  }
}

/**
 * O link vence em 7 dias, mas o zip (XML com CPF de cliente) ficaria no bucket para sempre.
 * Lista tudo antes de apagar: apagar no meio da paginação desloca o offset.
 */
export async function apagarZipsVencidos(a: ArmazemZips, agora: number = Date.now()): Promise<{ apagados: number; falhas: number }> {
  const limite = agora - VALIDADE_LINK_DIAS * 24 * 60 * 60 * 1000
  const vencidos: string[] = []
  let falhas = 0
  let raiz: Objeto[]
  try {
    raiz = await listarTudo(a, '')
  } catch {
    return { apagados: 0, falhas: 1 }
  }
  // Na raiz, id null é pasta (grupo). Pasta que falhou não impede as outras; a falha volta contada.
  for (const pasta of raiz.filter(o => o.id === null)) {
    try {
      for (const o of await listarTudo(a, pasta.name)) {
        if (o.created_at && Date.parse(o.created_at) < limite) vencidos.push(`${pasta.name}/${o.name}`)
      }
    } catch {
      falhas++
    }
  }
  for (let i = 0; i < vencidos.length; i += PAGINA) await a.remover(vencidos.slice(i, i + PAGINA))
  return { apagados: vencidos.length, falhas }
}

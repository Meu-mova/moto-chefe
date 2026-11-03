// Limpeza de arquivo vencido no Storage, por pasta de grupo: quem guarda dado pessoal
// ou fiscal no bucket já nasce com expiração e um cron que apaga de todos os grupos
// (AGENTS.md, "Multi-grupo e permissões"). Zips do contador (#402) e comprovante de
// sinal de demanda usam esta.

/** Forma conferida no staging (26/10): StorageApiError, statusCode 404, "Bucket not found". O resto (rede, 5xx) é falha. */
export function bucketInexistente(erro: { statusCode?: unknown; message?: string }): boolean {
  return String(erro.statusCode) === '404' || /bucket not found/i.test(erro.message ?? '')
}

type Objeto = { name: string; id: string | null; created_at: string | null }

/** O bucket entra por parâmetro: o Storage não existe no Postgres do CI. `listar` lança erro se a listagem falhar. */
export type Armazem = {
  listar(pasta: string, offset: number, limite: number): Promise<Objeto[]>
  remover(caminhos: string[]): Promise<void>
}

const PAGINA = 100
const DIA_MS = 24 * 60 * 60 * 1000

async function listarTudo(a: Armazem, pasta: string): Promise<Objeto[]> {
  const todos: Objeto[] = []
  for (let offset = 0; ; offset += PAGINA) {
    const pagina = await a.listar(pasta, offset, PAGINA)
    todos.push(...pagina)
    if (pagina.length < PAGINA) return todos
  }
}

/**
 * Apaga o que tem mais de `dias` em `<raiz>/<grupo>/<arquivo>` (raiz '' = o bucket inteiro).
 * Lista tudo antes de apagar: apagar no meio da paginação desloca o offset.
 */
export async function apagarArquivosVencidos(
  a: Armazem,
  opcoes: { raiz: string; dias: number },
  agora: number = Date.now(),
): Promise<{ apagados: number; falhas: number }> {
  const limite = agora - opcoes.dias * DIA_MS
  const prefixo = opcoes.raiz ? `${opcoes.raiz}/` : ''
  const vencidos: string[] = []
  let falhas = 0
  let pastas: Objeto[]
  try {
    pastas = await listarTudo(a, opcoes.raiz)
  } catch {
    return { apagados: 0, falhas: 1 }
  }
  // Na raiz, id null é pasta (grupo). Pasta que falhou não impede as outras; a falha volta contada.
  for (const pasta of pastas.filter(o => o.id === null)) {
    try {
      for (const o of await listarTudo(a, `${prefixo}${pasta.name}`)) {
        if (o.created_at && Date.parse(o.created_at) < limite) vencidos.push(`${prefixo}${pasta.name}/${o.name}`)
      }
    } catch {
      falhas++
    }
  }
  for (let i = 0; i < vencidos.length; i += PAGINA) await a.remover(vencidos.slice(i, i + PAGINA))
  return { apagados: vencidos.length, falhas }
}

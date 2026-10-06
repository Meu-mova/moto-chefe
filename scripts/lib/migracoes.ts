/**
 * Lógica pura do migrate.ts: compara os arquivos de src/lib/db/migrations com
 * o que a tabela schema_migrations diz que já rodou naquele banco.
 */
import { createHash } from 'node:crypto'

export type ArquivoMigracao = { arquivo: string; checksum: string }
export type RegistroMigracao = { arquivo: string; checksum: string }

const PADRAO_ARQUIVO = /^(\d{4})_.+\.sql$/

export function checksumDe(conteudo: string): string {
  return createHash('sha256').update(conteudo).digest('hex')
}

export function filtrarArquivosMigracao(nomes: string[]): string[] {
  return nomes.filter(n => PADRAO_ARQUIVO.test(n)).sort()
}

export function numeroDe(arquivo: string): number {
  const m = arquivo.match(PADRAO_ARQUIVO)
  if (!m) throw new Error(`Nome fora do padrão NNNN_nome.sql: ${arquivo}`)
  return parseInt(m[1], 10)
}

// BEGIN/COMMIT do próprio arquivo fecharia a transação que o migrate.ts abre, e
// o registro em schema_migrations deixaria de andar junto com a mudança. O
// `BEGIN` sem ponto e vírgula de corpo plpgsql não casa aqui.
const CONTROLE_DE_TRANSACAO = /^\s*(begin|start\s+transaction|commit|rollback)\s*;/im

export function temControleDeTransacao(conteudo: string): boolean {
  return CONTROLE_DE_TRANSACAO.test(conteudo)
}

export type Plano<T extends ArquivoMigracao> = {
  pendentes: T[]
  problemas: string[]
  /** Pendentes com número abaixo do maior já aplicado: aplicam, mas merecem um olhar. */
  foraDeOrdem: string[]
}

/**
 * Qualquer problema bloqueia a aplicação inteira: cada um significa que o banco
 * e o repo discordam sobre o passado, e aplicar por cima só esconderia isso.
 */
export function planejar<T extends ArquivoMigracao>(arquivos: T[], registros: RegistroMigracao[]): Plano<T> {
  const problemas: string[] = []
  const porArquivo = new Map(arquivos.map(a => [a.arquivo, a]))

  const vistosPorNumero = new Map<number, string>()
  for (const a of arquivos) {
    const n = numeroDe(a.arquivo)
    const outro = vistosPorNumero.get(n)
    // Dois PRs em paralelo pegando o mesmo número: um tem que ser renumerado.
    if (outro) problemas.push(`Número repetido: ${outro} e ${a.arquivo}`)
    vistosPorNumero.set(n, a.arquivo)
  }

  for (const r of registros) {
    const a = porArquivo.get(r.arquivo)
    if (!a) {
      problemas.push(`Registrada no banco mas sem arquivo no repo: ${r.arquivo}`)
    } else if (a.checksum !== r.checksum) {
      problemas.push(`Arquivo mudou depois de aplicado (checksum diferente): ${r.arquivo}`)
    }
  }

  const aplicados = new Set(registros.map(r => r.arquivo))
  const pendentes = arquivos
    .filter(a => !aplicados.has(a.arquivo))
    .sort((x, y) => x.arquivo.localeCompare(y.arquivo))

  const maiorAplicado = Math.max(-1, ...registros.filter(r => porArquivo.has(r.arquivo)).map(r => numeroDe(r.arquivo)))
  const foraDeOrdem = pendentes.filter(p => numeroDe(p.arquivo) < maiorAplicado).map(p => p.arquivo)

  return { pendentes, problemas, foraDeOrdem }
}

/** Arquivos que o baseline marca como já aplicados: todos até `limite`, inclusive. */
export function arquivosDoBaseline<T extends ArquivoMigracao>(arquivos: T[], limite: number): T[] {
  return arquivos.filter(a => numeroDe(a.arquivo) <= limite)
}

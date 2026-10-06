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

/** Só os NNNN_*.sql, em ordem. Ignora meta/ e qualquer outra coisa da pasta. */
export function filtrarArquivosMigracao(nomes: string[]): string[] {
  return nomes.filter(n => PADRAO_ARQUIVO.test(n)).sort()
}

export function numeroDe(arquivo: string): number {
  const m = arquivo.match(PADRAO_ARQUIVO)
  if (!m) throw new Error(`Nome fora do padrão NNNN_nome.sql: ${arquivo}`)
  return parseInt(m[1], 10)
}

export type Plano = { pendentes: ArquivoMigracao[]; problemas: string[] }

/**
 * Qualquer problema bloqueia a aplicação inteira: cada um significa que o banco
 * e o repo discordam sobre o passado, e aplicar por cima só esconderia isso.
 */
export function planejar(arquivos: ArquivoMigracao[], registros: RegistroMigracao[]): Plano {
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

  return { pendentes, problemas }
}

/** Arquivos que o baseline marca como já aplicados: todos até `limite`, inclusive. */
export function arquivosDoBaseline(arquivos: ArquivoMigracao[], limite: number): ArquivoMigracao[] {
  return arquivos.filter(a => numeroDe(a.arquivo) <= limite)
}

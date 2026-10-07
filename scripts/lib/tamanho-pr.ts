/**
 * Linhas de produção de um PR, para a diretriz de tamanho do CONTRIBUTING.md
 * ("Tamanho de PR"; D13 do plano de staging/CI). Entrada: `git diff --numstat -M`.
 */

export const LIMITE_ALERTA = 400
export const LIMITE_JUSTIFICATIVA = 500
export const MARCADOR_COMENTARIO = '<!-- tamanho-pr -->'

export type ArquivoContado = { arquivo: string; linhas: number }
export type Contagem = { total: number; arquivos: ArquivoContado[] }

// O que o CONTRIBUTING.md manda não contar. Migração SQL escrita à mão conta: é código.
const FORA_DO_LIMITE: RegExp[] = [
  /\.test\.tsx?$/,
  /\.md$/,
  /^docs\//,
  /^src\/lib\/db\/migrations\/meta\//,
  /^supabase\/schema-baseline\.sql$/,
  /(^|\/)package-lock\.json$/,
]

export function contaNoLimite(arquivo: string): boolean {
  return !FORA_DO_LIMITE.some(padrao => padrao.test(arquivo))
}

/** Com -M, renomeação vem como `a => b` ou `pasta/{a => b}/x`; vale o caminho novo. */
export function caminhoFinal(campo: string): string {
  return campo
    .replace(/\{([^{}]*) => ([^{}]*)\}/g, '$2')
    .replace(/^.* => /, '')
    .replace(/\/{2,}/g, '/')
}

export function contarLinhasDeProducao(numstat: string): Contagem {
  const arquivos: ArquivoContado[] = []
  for (const linha of numstat.split('\n')) {
    const [adicionadas, removidas, ...resto] = linha.split('\t')
    if (resto.length === 0) continue
    const arquivo = caminhoFinal(resto.join('\t'))
    if (!contaNoLimite(arquivo)) continue
    // Binário vem como "-": não tem linha para contar.
    const linhas = (Number(adicionadas) || 0) + (Number(removidas) || 0)
    if (linhas > 0) arquivos.push({ arquivo, linhas })
  }
  arquivos.sort((a, b) => b.linhas - a.linhas)
  return { total: arquivos.reduce((soma, a) => soma + a.linhas, 0), arquivos }
}

export function montarComentario({ total, arquivos }: Contagem): string {
  if (total <= LIMITE_ALERTA) {
    return `${MARCADOR_COMENTARIO}\n**Tamanho do PR: ${total} linhas de produção**, dentro do alvo (até ${LIMITE_ALERTA}).\n`
  }
  const pedido = total > LIMITE_JUSTIFICATIVA
    ? `Acima de ${LIMITE_JUSTIFICATIVA}: justifique na descrição do PR (ex.: migração grande, remoção de código morto, feature que não dá para dividir).`
    : `Entre ${LIMITE_ALERTA} e ${LIMITE_JUSTIFICATIVA}: vale conferir se dá para separar responsabilidades.`
  const maiores = arquivos.slice(0, 15).map(a => `| \`${a.arquivo}\` | ${a.linhas} |`)
  const outros = arquivos.length > 15 ? [`| (mais ${arquivos.length - 15} arquivos) | |`] : []
  return [
    MARCADOR_COMENTARIO,
    `**Tamanho do PR: ${total} linhas de produção** (alvo: até ${LIMITE_ALERTA}). É alerta, não bloqueio.`,
    '',
    pedido,
    '',
    '| Arquivo | Linhas (+/−) |',
    '|---|---|',
    ...maiores,
    ...outros,
    '',
    'Não contam: testes, docs, gerados (`migrations/meta`, `schema-baseline.sql`), lockfiles e renomeação sem mudança. Regra em `CONTRIBUTING.md` ("Tamanho de PR").',
    '',
  ].join('\n')
}

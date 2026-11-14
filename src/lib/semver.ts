// Versão do MOVA no formato do package.json: 'X.Y.Z', só números (o MOVA não usa pré-release).
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function ehSemVer(versao: string): boolean {
  return SEMVER.test(versao)
}

/**
 * Negativo se `a` é anterior a `b`, zero se iguais, positivo se posterior. Compara número a
 * número: como texto, '1.9.0' viria depois de '1.10.0'. Só para versões que passam em `ehSemVer`.
 */
export function compararSemVer(a: string, b: string): number {
  const partesA = a.split('.').map(Number)
  const partesB = b.split('.').map(Number)
  return partesA.map((n, i) => n - partesB[i]).find(d => d !== 0) ?? 0
}

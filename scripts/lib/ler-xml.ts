/** Leitura dos XMLs de NF-e dos scripts de operador. */
import { readFileSync } from 'node:fs'

/** Notas antigas saem em ISO-8859-1; ler tudo como UTF-8 corrompe o acento. */
export function decodificarXml(buf: Buffer): string {
  const utf8 = buf.toString('utf8')
  return utf8.includes('\uFFFD') ? buf.toString('latin1') : utf8
}

export function lerXml(caminho: string): string {
  return decodificarXml(readFileSync(caminho))
}

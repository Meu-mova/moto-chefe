import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Arquivos de `dir` e das subpastas (caminho a partir de `dir`), só os que `aceita` deixar. */
export function listarArquivos(dir: string, aceita: (caminho: string) => boolean = () => true): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => join(e.parentPath, e.name))
    .filter(aceita)
}

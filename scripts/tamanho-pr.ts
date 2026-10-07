/**
 * Usado pelo workflow pr-size.yml:
 *   git diff --numstat -M <base>...<head> | node --import tsx scripts/tamanho-pr.ts <arquivo do comentário>
 * Escreve o comentário no arquivo e imprime só o total de linhas de produção.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { contarLinhasDeProducao, montarComentario } from './lib/tamanho-pr'

const destino = process.argv[2]
if (!destino) {
  console.error('Uso: git diff --numstat -M <base>...<head> | node --import tsx scripts/tamanho-pr.ts <arquivo do comentário>')
  process.exit(1)
}

const contagem = contarLinhasDeProducao(readFileSync(0, 'utf8'))
writeFileSync(destino, montarComentario(contagem))
console.log(contagem.total)

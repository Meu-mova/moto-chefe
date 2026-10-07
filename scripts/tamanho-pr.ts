/**
 * Usado pelo workflow pr-size.yml:
 *   git -c core.quotePath=false diff --numstat -M <base>...<head> | node --import tsx scripts/tamanho-pr.ts <arquivo do comentário>
 * (sem quotePath=false, caminho com acento sai entre aspas e escapa dos filtros de docs).
 * Escreve o comentário no arquivo e imprime "<total> <grande|ok>".
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { acimaDoAlerta, contarLinhasDeProducao, montarComentario } from './lib/tamanho-pr'

const destino = process.argv[2]
if (!destino) {
  console.error('Uso: git -c core.quotePath=false diff --numstat -M <base>...<head> | node --import tsx scripts/tamanho-pr.ts <arquivo do comentário>')
  process.exit(1)
}

const contagem = contarLinhasDeProducao(readFileSync(0, 'utf8'))
writeFileSync(destino, montarComentario(contagem))
console.log(`${contagem.total} ${acimaDoAlerta(contagem.total) ? 'grande' : 'ok'}`)

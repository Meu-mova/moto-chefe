/**
 * Cor fixa no código de interface (CLAUDE.md "Cores", épica #90).
 *   node --import tsx scripts/cores-fixas.ts               inventário por área e arquivo
 *   git diff -U0 <base>...<head> | node --import tsx scripts/cores-fixas.ts --diff
 *                                                         falha se linha adicionada tiver cor fixa
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { acharCoresFixas, area, linhasAdicionadas, verificaArquivo } from './lib/cores-fixas'

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    return statSync(caminho).isDirectory() ? listar(caminho) : [caminho]
  })
}

if (process.argv.includes('--diff')) {
  const achados = linhasAdicionadas(readFileSync(0, 'utf8'))
    .filter((l) => verificaArquivo(l.arquivo))
    .flatMap((l) => acharCoresFixas(l.texto, l.arquivo).map((cor) => ({ ...l, cor })))
  for (const a of achados) console.log(`::error file=${a.arquivo},line=${a.linha}::cor fixa "${a.cor}": use a cor com nome do globals.css`)
  if (achados.length) {
    console.error(`${achados.length} cor(es) fixa(s) em linha nova. Ver CLAUDE.md "Cores".`)
    process.exit(1)
  }
  console.log('Nenhuma cor fixa nas linhas adicionadas.')
} else {
  const porArquivo = listar('src')
    .filter(verificaArquivo)
    .map((arquivo) => ({ arquivo, total: readFileSync(arquivo, 'utf8').split('\n').reduce((s, l) => s + acharCoresFixas(l, arquivo).length, 0) }))
    .filter((a) => a.total > 0)
  const porArea = new Map<string, typeof porArquivo>()
  for (const a of porArquivo) porArea.set(area(a.arquivo), [...(porArea.get(area(a.arquivo)) ?? []), a])
  const soma = (xs: typeof porArquivo) => xs.reduce((s, a) => s + a.total, 0)
  console.log(`Total: ${soma(porArquivo)} cores fixas em ${porArquivo.length} arquivos\n`)
  for (const [nome, arquivos] of [...porArea].sort((x, y) => soma(y[1]) - soma(x[1]))) {
    console.log(`## ${nome}: ${soma(arquivos)} em ${arquivos.length} arquivos`)
    if (process.argv.includes('--arquivos')) for (const a of arquivos.sort((x, y) => y.total - x.total)) console.log(`  ${a.total}\t${a.arquivo}`)
  }
}

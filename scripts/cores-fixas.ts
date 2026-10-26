/**
 * Cor fixa no código de interface (CLAUDE.md "Cores", épica #90).
 *   node --import tsx scripts/cores-fixas.ts               inventário por área e arquivo
 *   git diff -U0 <base>...<head> | node --import tsx scripts/cores-fixas.ts --diff
 *                                                         falha se linha adicionada tiver cor fixa
 *                                                         ou hover igual à cor de base
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { acharCoresFixas, acharHoverRepetido, area, LIBERA_HOVER, linhasAdicionadas, verificaArquivo } from './lib/cores-fixas'

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    return statSync(caminho).isDirectory() ? listar(caminho) : [caminho]
  })
}

if (process.argv.includes('--diff')) {
  const adicionadas = linhasAdicionadas(readFileSync(0, 'utf8')).filter((l) => verificaArquivo(l.arquivo))
  const achados = adicionadas.flatMap((l) => acharCoresFixas(l.texto, l.arquivo).map((cor) => ({ ...l, cor })))
  for (const a of achados) console.log(`::error file=${a.arquivo},line=${a.linha}::cor fixa "${a.cor}": use a cor com nome do globals.css`)
  // O arquivo inteiro (do checkout) mostra em que tag a linha está: o className costuma vir abaixo do <Button.
  const arquivos = new Map<string, string[]>()
  const linhasDe = (arquivo: string) => {
    if (!arquivos.has(arquivo)) arquivos.set(arquivo, existsSync(arquivo) ? readFileSync(arquivo, 'utf8').split('\n') : [])
    return arquivos.get(arquivo)!
  }
  const hovers = adicionadas.filter((l) => l.arquivo.endsWith('.tsx')).flatMap((l) => {
    const linhas = linhasDe(l.arquivo)
    const noArquivo = linhas[l.linha - 1] === l.texto
    return acharHoverRepetido(noArquivo ? linhas : [l.texto], noArquivo ? l.linha - 1 : 0).map((hover) => ({ ...l, hover }))
  })
  for (const h of hovers) console.log(`::error file=${h.arquivo},line=${h.linha}::"${h.hover}" repete a cor de base: o hover não muda nada. Use outro tom (ex.: hover:opacity-80, hover:bg-border) ou "${LIBERA_HOVER}: <motivo>"`)
  if (achados.length || hovers.length) {
    if (achados.length) console.error(`${achados.length} cor(es) fixa(s) em linha nova. Ver CLAUDE.md "Cores".`)
    if (hovers.length) console.error(`${hovers.length} hover(s) igual(is) à cor de base em linha nova.`)
    process.exit(1)
  }
  console.log('Nenhuma cor fixa nem hover repetido nas linhas adicionadas.')
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

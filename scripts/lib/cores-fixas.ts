// Cor fixa = cor que não muda com o tema (CLAUDE.md "Cores", ADR-0016). Usado pelo inventário
// (scripts/cores-fixas.ts) e pela checagem do CI nas linhas adicionadas do PR.

const PALETA = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILITARIO = 'bg|text|border(?:-[xytrblse])?|ring|ring-offset|from|via|to|fill|stroke|outline|divide|placeholder|shadow|accent|caret|decoration'

const PADROES = [
  // bg-slate-900, text-emerald-500/80, border-white
  new RegExp(`(?<![\\w-])(?:${UTILITARIO})-(?:(?:${PALETA})-\\d{2,3}|white|black)(?:\\/\\d{1,3})?(?![\\w-])`, 'g'),
  // bg-[#047a4f], text-[rgb(...)]
  new RegExp(`(?<![\\w-])(?:${UTILITARIO})-\\[(?:#|rgb|hsl|oklch)[^\\]]*\\]`, 'g'),
  // '#e2e8f0' ou "#fff" (entre aspas, para não pegar "#90" em texto)
  /(?<=['"`])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?=['"`])/g,
  /\b(?:rgba?|hsla?|oklch)\([^)]*\)/g,
]

// Linha de comentário não pinta nada; "cor-fixa-ok" marca cor que não é da interface (HTML de
// terceiro lido por scraper, impresso que fica sempre claro), com o motivo ao lado.
export const LIBERA = 'cor-fixa-ok'

export function acharCoresFixas(linha: string): string[] {
  if (/^\s*(\/\/|\/?\*|\{\/\*)/.test(linha) || new RegExp(`${LIBERA}: \\S`).test(linha)) return []
  const achados: { pos: number; texto: string }[] = []
  for (const padrao of PADROES) {
    for (const m of linha.matchAll(padrao)) {
      // O valor arbitrário já foi contado inteiro; não repetir o hex/rgb de dentro.
      if (achados.some((a) => m.index >= a.pos && m.index < a.pos + a.texto.length)) continue
      achados.push({ pos: m.index, texto: m[0] })
    }
  }
  return achados.sort((a, b) => a.pos - b.pos).map((a) => a.texto)
}

export function verificaArquivo(caminho: string): boolean {
  if (!caminho.startsWith('src/')) return false
  if (caminho === 'src/app/globals.css') return false
  if (/\.test\.tsx?$/.test(caminho)) return false
  return /\.(tsx|ts|css)$/.test(caminho)
}

export function area(caminho: string): string {
  const partes = caminho.split('/')
  if (partes[1] === 'components') return partes[2] === 'ui' ? 'components/ui' : 'components'
  if (partes[1] !== 'app') return partes[1]
  if (partes[2]?.startsWith('(') && partes[2] !== '(dashboard)') return partes[2]
  if (partes[2] === '(dashboard)') return partes[3]?.includes('.') ? '(dashboard)' : partes[3]
  return partes[2]?.includes('.') ? 'app' : partes[2]
}

export type LinhaAdicionada = { arquivo: string; linha: number; texto: string }

export function linhasAdicionadas(diffUnificado: string): LinhaAdicionada[] {
  const saida: LinhaAdicionada[] = []
  let arquivo = ''
  let linha = 0
  for (const bruta of diffUnificado.split('\n')) {
    if (bruta.startsWith('+++ ')) {
      arquivo = bruta.slice(4).replace(/^b\//, '')
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(bruta)
    if (hunk) {
      linha = Number(hunk[1])
      continue
    }
    if (!arquivo) continue
    if (bruta.startsWith('+')) saida.push({ arquivo, linha: linha++, texto: bruta.slice(1) })
    else if (bruta.startsWith(' ')) linha++
  }
  return saida
}

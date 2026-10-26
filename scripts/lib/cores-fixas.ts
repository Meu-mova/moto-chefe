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

// Em CSS o hex vem sem aspas; só conta no valor de uma declaração (depois de ":"), para não
// pegar seletor de id como #fade (nem depois de pseudo-classe, como .a:hover #abc {).
const HEX_CSS = /(?<=:[^;{}]*)(?<![\w-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])(?![^{]*\{)/g

// Linha de comentário não pinta nada; "cor-fixa-ok" marca cor que não é da interface (HTML de
// terceiro lido por scraper, impresso que fica sempre claro), com o motivo ao lado.
export const LIBERA = 'cor-fixa-ok'

export function acharCoresFixas(linha: string, caminho = ''): string[] {
  if (/^\s*(\/\/|\/?\*|\{\/\*)/.test(linha) || new RegExp(`${LIBERA}: \\S`).test(linha)) return []
  const achados: { pos: number; texto: string }[] = []
  for (const padrao of caminho.endsWith('.css') ? [...PADROES, HEX_CSS] : PADROES) {
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

// Hover que repete a cor de base não dá retorno nenhum ao passar o mouse (a migração da #90 juntou
// tons como blue-600/blue-700 no mesmo token). Button, Badge e TableRow são exceção: neles o par
// anula o hover padrão do componente (o ghost ainda escurece o fundo). Outro caso de propósito:
// "hover-igual-ok: <motivo>" na linha ou na de cima.
const COMPONENTES_QUE_ANULAM = new Set(['Button', 'Badge', 'TableRow'])
export const LIBERA_HOVER = 'hover-igual-ok'

// Tag dona da classe: a última aberta antes dela na linha, ou nas linhas de cima.
function tagAberta(linhas: string[], indice: number, coluna: number): string | undefined {
  for (let i = indice; i >= Math.max(0, indice - 10); i--) {
    const tags = [...(i === indice ? linhas[i].slice(0, coluna) : linhas[i]).matchAll(/<([A-Za-z][\w.]*)/g)]
    if (tags.length) return tags[tags.length - 1][1]
  }
}

export function acharHoverRepetido(linhas: string[], indice = 0): string[] {
  const linha = linhas[indice]
  const libera = new RegExp(`${LIBERA_HOVER}: \\S`)
  if (libera.test(linha) || (indice > 0 && libera.test(linhas[indice - 1]))) return []
  const achados: string[] = []
  for (const m of linha.matchAll(/(['"`])((?:(?!\1).)*)\1/g)) {
    const tag = tagAberta(linhas, indice, m.index)
    if (tag && COMPONENTES_QUE_ANULAM.has(tag)) continue
    const classes = m[2]
    const tokens = classes.split(/\s+/)
    for (const t of tokens) {
      const partes = t.split(':')
      if (!partes.slice(0, -1).some((p) => p === 'hover' || p === 'group-hover')) continue
      const base = partes.filter((p) => p !== 'hover' && p !== 'group-hover').join(':')
      if (/^(?:[\w-]+:)*(?:text|bg|border)-/.test(base) && tokens.includes(base)) achados.push(t)
    }
  }
  return achados
}

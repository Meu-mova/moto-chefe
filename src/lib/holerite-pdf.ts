// ─── Leitura do holerite em PDF que a contabilidade manda ─────────────────────
//
// O PDF é de texto (não é digitalização), mas o texto sai na ordem do
// content-stream, não na ordem visual: os rótulos "Total de Vencimentos / Valor
// Líquido / Total de Descontos" vêm num bloco e os números em outro. Por isso a
// leitura remonta as LINHAS a partir das coordenadas de cada pedaço, e só então
// procura o rótulo — em `extractText` puro não há como saber qual número é qual.
//
// A divisão em três funções é o que torna isso testável: só `extrairHolerite`
// toca o PDF; `reconstruirLinhas` e `lerHolerite` são puras (ver holerite-pdf.test.ts).

/** Um pedaço de texto com a posição onde ele foi desenhado na página. */
export type ItemTexto = { x: number; y: number; texto: string }

export type HoleriteLido = {
  /** Nome como está no papel, em caixa alta. null quando o layout não bateu. */
  nome: string | null
  /** Competência em 'YYYY-MM'. É o mês do TRABALHO, não o do pagamento. */
  competencia: string | null
  /** Valor líquido do recibo. null quando não deu para ler com segurança. */
  liquido: number | null
}

const MESES: Record<string, string> = {
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
}

/** Tolerância vertical para dois pedaços contarem como a mesma linha, em pontos. */
const TOLERANCIA_Y = 2.5

const NUMERO = /\d{1,3}(?:\.\d{3})*,\d{2}/g

/** "1.418,90" → 1418.9 */
function paraNumero(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}

/** Tira acento e caixa, para comparar nome sem depender de como foi digitado. */
export function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * Remonta as linhas visuais da página.
 *
 * Agrupa por proximidade em Y (e não por Y arredondado: arredondar corta em
 * pontos fixos e separa em duas linhas dois pedaços que caem em lados opostos do
 * corte — foi o que fez o rótulo "Valor Líquido" perder o número dele numa das
 * páginas). Dentro da linha, ordena por X, que é a ordem da leitura.
 */
export function reconstruirLinhas(itens: ItemTexto[]): string[] {
  const validos = itens.filter(i => i.texto.trim() !== '')
  if (validos.length === 0) return []

  // Y cresce para cima no PDF, então a ordem de leitura é decrescente.
  const ordenados = [...validos].sort((a, b) => b.y - a.y)
  const grupos: ItemTexto[][] = []
  let atual: ItemTexto[] = [ordenados[0]]
  let refY = ordenados[0].y

  for (const item of ordenados.slice(1)) {
    if (Math.abs(item.y - refY) <= TOLERANCIA_Y) {
      atual.push(item)
    } else {
      grupos.push(atual)
      atual = [item]
      refY = item.y
    }
  }
  grupos.push(atual)

  return grupos.map(g =>
    g.sort((a, b) => a.x - b.x).map(i => i.texto).join(' ').replace(/\s+/g, ' ').trim(),
  )
}

/**
 * Extrai nome, competência e líquido das linhas remontadas.
 *
 * Cada campo é independente: um layout que mude o cabeçalho não pode levar junto
 * o valor, porque quem chama decide o que fazer com cada pedaço que faltou.
 */
export function lerHolerite(linhas: string[]): HoleriteLido {
  return {
    nome: lerNome(linhas),
    competencia: lerCompetencia(linhas),
    liquido: lerLiquido(linhas),
  }
}

function lerNome(linhas: string[]): string | null {
  const i = linhas.findIndex(l => /Nome do Funcion/i.test(l))
  if (i < 0) return null
  // A linha seguinte é "<código> NOME COMPLETO <CBO> <depto> <filial>": tira o
  // código da frente e corta no primeiro campo numérico depois do nome.
  const bruta = (linhas[i + 1] ?? '').replace(/^\s*\d+\s+/, '')
  const nome = bruta.split(/\s+\d/)[0]?.trim()
  return nome && /[A-Za-zÀ-ÿ]{3}/.test(nome) ? normalizarNome(nome) : null
}

function lerCompetencia(linhas: string[]): string | null {
  for (const l of linhas) {
    const m = l.match(/(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i)
    if (m) {
      const mes = MESES[normalizarNome(m[1]).toLowerCase()]
      if (mes) return `${m[2]}-${mes}`
    }
  }
  return null
}

/**
 * Valor líquido.
 *
 * Com as linhas remontadas o número quase sempre cai colado no rótulo. Quando a
 * linha traz dois números, são os totais de vencimentos e descontos que o layout
 * do adiantamento encosta no rótulo — aí o líquido é a diferença, e não o
 * primeiro número (que seria o bruto: a Brenda pagou 752,00 de adiantamento com
 * 185,21 de desconto, líquido 566,79).
 */
function lerLiquido(linhas: string[]): number | null {
  for (const l of linhas) {
    if (!/Valor\s+L[ií]quido/i.test(l)) continue
    const nums = (l.match(NUMERO) ?? []).map(paraNumero)
    if (nums.length === 1) return nums[0]
    if (nums.length >= 2) return Math.round((nums[0] - nums[1]) * 100) / 100
    // Rótulo sem número nenhum: página em que o valor ficou noutra linha. Segue
    // procurando — a segunda via do mesmo recibo costuma trazer os dois juntos.
  }
  return null
}

/**
 * O nome do papel corresponde à pessoa escolhida no slot?
 *
 * Exige que cada palavra do nome CADASTRADO apareça no nome do papel, e não o
 * contrário: o cadastro costuma ter menos nomes que o documento ("Anne Ester" no
 * sistema, "ANNE ESTER SILVA DIAS" no holerite). Preposições ficam de fora, e
 * também qualquer palavra de até 2 letras, que não distingue ninguém.
 */
export function nomeConfere(nomeCadastro: string, nomeDoPdf: string): boolean {
  const ignorar = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'])
  // Conjunto de palavras, e não busca de substring: sem isso "ANA" casaria
  // dentro de "ANALICE" e aprovaria o holerite da pessoa errada.
  const tokensDoPapel = new Set(normalizarNome(nomeDoPdf).split(' '))
  const partes = normalizarNome(nomeCadastro)
    .split(' ')
    .filter(p => p.length > 2 && !ignorar.has(p))
  if (partes.length === 0) return false
  return partes.every(p => tokensDoPapel.has(p))
}

/** Lê o PDF inteiro. Única função daqui que faz I/O. */
export async function extrairHolerite(bytes: Uint8Array): Promise<HoleriteLido> {
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(bytes)
  const pagina = await pdf.getPage(1)
  const conteudo = await pagina.getTextContent()

  const itens: ItemTexto[] = conteudo.items
    .filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i)
    .map(i => ({ x: i.transform[4], y: i.transform[5], texto: i.str }))

  return lerHolerite(reconstruirLinhas(itens))
}

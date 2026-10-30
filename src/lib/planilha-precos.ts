// Planilha de preço de venda por modelo (#522): a tabela padrão da MotoChefe, carregada
// pelo admin_geral, e a do sócio. Só o preço à vista entra; as colunas de cartão da
// tabela da MotoChefe (12X, 18X, 21X) são ignoradas, porque o cartão sai das taxas do grupo.
// Sem banco e sem xlsx: recebe a planilha já em linhas, para ser testada e rodar no servidor.

export type LinhaDePreco = { linha: number; modelo: string; preco: number }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const cabecalho = (v: unknown) => semAcento(String(v ?? '')).trim().toUpperCase()

const COLUNAS_DE_PRECO = ['PRECO', 'PIX', 'DINHEIRO', 'A VISTA']

function lerPreco(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null
  const texto = String(v ?? '').replace(/R\$/i, '').replace(/\s/g, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(texto)) return null
  const n = Number(texto.replace(/\./g, '').replace(',', '.'))
  return n > 0 ? n : null
}

// O payload vem do navegador: só linhas de texto ou número passam.
export function ehMatrizDePlanilha(v: unknown): v is unknown[][] {
  return Array.isArray(v) && v.length <= 5000 && v.every(l =>
    Array.isArray(l) && l.length <= 50 && l.every(c => c === null || ['string', 'number'].includes(typeof c)))
}

export function lerPlanilhaDePrecos(matriz: unknown[][]): { linhas: LinhaDePreco[]; erros: string[] } {
  const topo = (matriz[0] ?? []).map(cabecalho)
  const colModelo = topo.indexOf('MODELO')
  const colPreco = topo.findIndex(c => COLUNAS_DE_PRECO.includes(c))
  if (colModelo < 0 || colPreco < 0) {
    return { linhas: [], erros: ['A primeira linha precisa ter as colunas MODELO e PREÇO (ou PIX)'] }
  }
  const linhas: LinhaDePreco[] = []
  const erros: string[] = []
  matriz.slice(1).forEach((cols, i) => {
    const modelo = String(cols?.[colModelo] ?? '').trim()
    if (!modelo) return
    const preco = lerPreco(cols[colPreco])
    if (preco === null) erros.push(`Linha ${i + 2} (${modelo}): preço inválido`)
    else linhas.push({ linha: i + 2, modelo, preco })
  })
  return { linhas, erros }
}

// A tabela escreve "JET MAX (1000W)" e "S8 - MINI"; o catálogo, "JETMAX" e "S8-MINI".
export function chaveDeModelo(nome: string) {
  return semAcento(nome).toUpperCase().replace(/\([^)]*\)/g, '').replace(/[\s-]/g, '')
}

export type ModeloCasavel = { id: string; nomes: string[] }
export type PrecoCasado = { modeloId: string; preco: number; linha: number }

export function casarComModelos(linhas: LinhaDePreco[], modelos: ModeloCasavel[]) {
  const porChave = new Map<string, Set<string>>()
  for (const m of modelos) {
    for (const nome of m.nomes) {
      const chave = chaveDeModelo(nome)
      porChave.set(chave, (porChave.get(chave) ?? new Set()).add(m.id))
    }
  }
  const nomeDe = new Map(modelos.map(m => [m.id, m.nomes[0]]))

  const avisos: string[] = []
  const candidatos: PrecoCasado[] = []
  for (const l of linhas) {
    // "GIGA/VASCO" é o mesmo preço para os dois modelos; o que o catálogo não tem fica de fora.
    const alternativas = l.modelo.replace(/\([^)]*\)/g, '').split('/')
    const ids: string[] = []
    let problema: string | null = null
    for (const alt of alternativas) {
      const achados = porChave.get(chaveDeModelo(alt))
      if (achados && achados.size > 1) problema = 'mais de um modelo com esse nome'
      else if (achados) ids.push(...achados)
    }
    if (!problema && !ids.length) problema = 'modelo não encontrado'
    if (problema) avisos.push(`Linha ${l.linha} (${l.modelo}): ${problema}`)
    else candidatos.push(...ids.map(modeloId => ({ modeloId, preco: l.preco, linha: l.linha })))
  }

  // Duas linhas para o mesmo modelo: não dá para saber qual vale, nenhuma grava.
  const linhasPorModelo = new Map<string, number[]>()
  for (const c of candidatos) linhasPorModelo.set(c.modeloId, [...(linhasPorModelo.get(c.modeloId) ?? []), c.linha])
  for (const [id, ls] of linhasPorModelo) {
    if (ls.length > 1) avisos.push(`Linhas ${ls.slice(0, -1).join(', ')} e ${ls.at(-1)}: o mesmo modelo (${nomeDe.get(id)}) aparece mais de uma vez`)
  }
  const casados = candidatos.filter(c => linhasPorModelo.get(c.modeloId)!.length === 1)
  return { casados, avisos }
}

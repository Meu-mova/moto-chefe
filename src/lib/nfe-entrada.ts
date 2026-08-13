// Extração de motos das NF-e de entrada (XML) para o módulo Entrada.
//
// As motos vêm no campo "Informações Complementares" (infAdic/infCpl) do XML,
// uma por ";", no formato:  MODELO [POTÊNCIA] CHASSI [MOTOR] COR
// Variações reais tratadas: modelo com espaço ("GIGA C/ BAU"), moto sem número
// de motor ("SOMA 1000W <chassi> BRANCO"), e lixo no fim (linha de ICMS, ";;;").

export type MotoNfe = { modelo: string; chassi: string; motor: string; cor: string }

export function normalizarModelo(s: string): string {
  return (s ?? '').toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Quebra o infCpl em motos. Puro — é o que os testes cobrem com notas reais.
 * A "potência" (token isolado tipo 1000W) é a âncora: o que vem antes é o
 * modelo, e entre ela e a cor (último token) fica o chassi [+ motor].
 */
export function parseMotosInfCpl(infCpl: string): MotoNfe[] {
  return (infCpl ?? '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entrada => {
      const t = entrada.split(/\s+/)
      // Âncora: token de potência isolado (1000W, 2000W...). Fica DENTRO de
      // motor (JYX1000W...) mas ali não é isolado, então ^\d+W$ não casa.
      const pIdx = t.findIndex(x => /^\d+w$/i.test(x))
      if (pIdx < 1) return null // sem modelo antes da potência → não é moto (ex.: linha de ICMS)
      const modelo = t.slice(0, pIdx).join(' ')
      const cor = t[t.length - 1]
      const meio = t.slice(pIdx + 1, t.length - 1) // chassi [+ motor]
      if (meio.length < 1) return null
      return { modelo, chassi: meio[0], motor: meio[1] ?? '', cor }
    })
    .filter((m): m is MotoNfe => m !== null)
}

/** Nº da nota e o infCpl cru a partir do XML. Regex simples — os campos são planos. */
export function extrairDaNfe(xml: string): { nNF: string; infCpl: string; qtdProdutos: number } {
  const nNF = (xml.match(/<nNF>([^<]*)<\/nNF>/) || [])[1]?.trim() ?? ''
  const infCpl = (xml.match(/<infCpl>([^<]*)<\/infCpl>/) || [])[1] ?? ''
  // Soma das quantidades dos produtos — serve de conferência (deve bater com o nº de motos).
  const qtdProdutos = [...xml.matchAll(/<qCom>([^<]*)<\/qCom>/g)]
    .reduce((s, m) => s + Math.round(parseFloat(m[1]) || 0), 0)
  return { nNF, infCpl, qtdProdutos }
}

/**
 * De-para do nome do modelo da NF para o modelo cadastrado no MOVA.
 * 1) match exato (normalizado); 2) senão, o MAIOR modelo cujo nome é prefixo
 * (palavra a palavra) do nome da NF — assim "GIGA C/ BAU" cai em "GIGA", mas
 * "MC20 MINI" continua batendo o exato e não vira "MC20".
 * Devolve o nome cadastrado (para casar no registrarEntradaLote) ou null.
 */
export function mapearModelo(nomeNf: string, modelosMova: string[]): string | null {
  const alvo = normalizarModelo(nomeNf)
  const mapa = new Map(modelosMova.map(m => [normalizarModelo(m), m]))
  if (mapa.has(alvo)) return mapa.get(alvo)!

  const tokens = alvo.split(' ')
  let melhor: string | null = null
  let melhorLen = 0
  for (const [norm, orig] of mapa) {
    const nt = norm.split(' ')
    if (nt.length <= tokens.length && nt.length > melhorLen && nt.every((tk, i) => tk === tokens[i])) {
      melhor = orig
      melhorLen = nt.length
    }
  }
  return melhor
}

// Extração de motos das NF-e de entrada (XML) para o módulo Entrada.
//
// As motos vêm no campo "Informações Complementares" (infAdic/infCpl) do XML,
// uma por ";", no formato:  MODELO POTÊNCIA [VARIANTE] CHASSI [MOTOR] COR
// Variações reais tratadas: modelo com espaço ("GIGA C/ BAU"), moto sem número
// de motor ("SOMA 1000W <chassi> BRANCO"), variante da fábrica entre parênteses
// ("X12 1000W (RC) ..." e "X12 1000W(RC) ..."), cor com mais de uma palavra
// ("AZUL TURQUESA") e lixo no fim (linha de ICMS, ";;;").

export type MotoNfe = { modelo: string; chassi: string; motor: string; cor: string }

// Chassi é VIN: 17 alfanuméricos. Vale para todos os fornecedores vistos
// (LYDAE3936T1205576, MCBRSOMA251031042, HL5TCAH3XT9W50420, R5XWL6315TM050036).
const RE_CHASSI = /^[A-Z0-9]{17}$/i

// Número de motor: código longo com letra E dígito (JYX1000W260580054,
// 10ZW6073316YA26190420, HRD48/60V1000W202604120315 — o BIG TRI tem barra).
// O que não casa é cor: nome de cor não tem dígito nem chega a 10 letras.
const RE_MOTOR = /^(?=.*\d)(?=.*[A-Z])[A-Z0-9/-]{10,}$/i

// Marcador de variante da fábrica, ex.: "(RC)". Não é chassi nem cor.
const RE_VARIANTE = /^\(.*\)$/

export function normalizarModelo(s: string): string {
  return (s ?? '').toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Quebra o infCpl em motos. Puro — é o que os testes cobrem com notas reais.
 * A "potência" (token tipo 1000W) é a âncora: o que vem antes é o modelo.
 * Depois dela, chassi e motor são achados pelo formato — não pela posição,
 * porque a fábrica intercala variante ("(RC)") e usa cor de duas palavras.
 */
export function parseMotosInfCpl(infCpl: string): MotoNfe[] {
  return (infCpl ?? '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entrada => {
      const t = entrada.split(/\s+/)
      // Âncora: token de potência (1000W, 3000W, 1000W(RC)). Fica DENTRO de
      // motor (JYX1000W...) mas ali não começa com dígito, então não casa.
      const pIdx = t.findIndex(x => /^\d+w($|\()/i.test(x))
      if (pIdx < 1) return null // sem modelo antes da potência → não é moto (ex.: linha de ICMS)
      const modelo = t.slice(0, pIdx).join(' ')

      const resto = t.slice(pIdx + 1).filter(x => !RE_VARIANTE.test(x))
      if (resto.length < 1) return null

      // Chassi pelo formato; se a nota fugir do padrão, cai no primeiro token
      // (comportamento antigo) em vez de descartar a moto em silêncio.
      const ci = resto.findIndex(x => RE_CHASSI.test(x))
      const iChassi = ci >= 0 ? ci : 0
      const chassi = resto[iChassi]

      // Motor é opcional (a SOMA não tem): só conta se o token seguinte tiver
      // cara de código. Tudo o que sobra é cor — inclusive "AZUL TURQUESA".
      const temMotor = RE_MOTOR.test(resto[iChassi + 1] ?? '')
      const motor = temMotor ? resto[iChassi + 1] : ''
      const cor = resto.slice(iChassi + (temMotor ? 2 : 1)).join(' ')
      if (!cor) return null

      return { modelo, chassi, motor, cor }
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

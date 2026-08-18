// Extração de motos das NF-e de entrada (XML) para o módulo Entrada.
//
// As motos vêm no campo "Informações Complementares" (infAdic/infCpl) do XML,
// uma por ";", no formato:  MODELO [POTÊNCIA] [VARIANTE] CHASSI [MOTOR] COR
//
// A âncora é o CHASSI, achado pelo formato — não a posição nem a potência.
// A potência é opcional na nota (cada fornecedor escreve de um jeito: "1000W"
// solto, "X12-1000W" colado, ou nada) e de todo modo não interessa: ela vem do
// cadastro de Modelos (modelos.potencia_w). Ancorar nela fazia notas inteiras
// virarem zero moto, em silêncio.
//
// Variações reais tratadas: modelo com espaço ("GIGA C/ BAU", "JET C/ NFC"),
// moto sem número de motor ("SOMA 1000W <chassi> BRANCO"), variante da fábrica
// entre parênteses ("X12 1000W (RC) ..." e "X12 1000W(RC) ..."), cor com mais
// de uma palavra ("AZUL TURQUESA") e lixo no fim (linha de ICMS, ";;;").

export type MotoNfe = { modelo: string; chassi: string; motor: string; cor: string }

// Chassi: bloco alfanumérico longo com pelo menos um dígito. Não dá para exigir
// os 17 do VIN (o BIG TRI usa 12: XL2026042062) nem exigir letra (o JOY SUPER
// usa só dígitos: 172922506150880). Nome de modelo não chega a 10 caracteres
// grudados com dígito ("X12", "MC20"; "X12-1000W" tem hífen e 9).
const RE_CHASSI = /^(?=.*\d)[A-Z0-9]{10,}$/i

// Número de motor: mesmo formato do chassi, mas aceita barra
// (HRD48/60V1000W202604120315, do BIG TRI). O que não casa é cor: nome de cor
// não tem dígito nem chega a 10 letras.
const RE_MOTOR = /^(?=.*\d)(?=.*[A-Z])[A-Z0-9/-]{10,}$/i

// Marcador de variante da fábrica: "(RC)", "(RP)" — e "(RP" sem fechar, que
// aparece nas notas 40743 e 40957. Não é modelo, nem chassi, nem cor.
const RE_VARIANTE = /^\(|\)$/

// Potência solta no meio do texto ("1000W", "1000W(RC)"). Sai do nome do modelo:
// quem manda é o cadastro. Colada ("X12-1000W") fica, e o de-para resolve.
const RE_POTENCIA = /^\d+w($|\()/i

export function normalizarModelo(s: string): string {
  return (s ?? '').toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Quebra o infCpl em motos. Puro — é o que os testes cobrem com notas reais.
 * O chassi é a âncora: antes dele vem o modelo, depois o motor (opcional) e a
 * cor. Linha sem chassi não é moto (ex.: a linha de ICMS no fim da nota).
 */
export function parseMotosInfCpl(infCpl: string): MotoNfe[] {
  return (infCpl ?? '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entrada => {
      const t = entrada.split(/\s+/).filter(x => !RE_VARIANTE.test(x))

      const iChassi = t.findIndex(x => RE_CHASSI.test(x))
      if (iChassi < 1) return null // sem chassi, ou sem modelo antes dele
      const chassi = t[iChassi]

      // Potência solta não faz parte do nome do modelo — vem do cadastro.
      const modelo = t.slice(0, iChassi).filter(x => !RE_POTENCIA.test(x)).join(' ')
      if (!modelo) return null

      // Motor é opcional (a SOMA não tem): só conta se o token seguinte tiver
      // cara de código. Tudo o que sobra é cor — inclusive "AZUL TURQUESA".
      const temMotor = RE_MOTOR.test(t[iChassi + 1] ?? '')
      const motor = temMotor ? t[iChassi + 1] : ''
      const cor = t.slice(iChassi + (temMotor ? 2 : 1)).join(' ')
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

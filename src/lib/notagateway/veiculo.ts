/**
 * Detalhamento de veículo novo na NF-e de saída (grupo veicProd, J01 do leiaute;
 * `veiculoNovo` no item da API da Nota Gateway). É o que o RENAVE usa para o
 * emplacamento depois.
 *
 * Só o ciclomotor leva: é a categoria que se emplaca. Autopropelido, bike e
 * afins saem sem o grupo, como hoje.
 *
 * Funções puras: a tela, a action e o payload decidem a mesma coisa.
 *
 * Quem emite preenche no ato do envio: o formulário fica aberto na tela e vai
 * junto com a transmissão. Chassi e motor vêm do cadastro da moto, editáveis.
 * O que foi enviado fica por moto (`motos_renave`) e volta preenchido numa
 * nova tentativa; o que é do modelo (potência, pesos, código RENAVAM) vem
 * sugerido da última moto do mesmo modelo, para não digitar de novo.
 */

export const OPCOES_TIPO_OPERACAO: [string, string][] = [
  ['VendaConcessionaria', '1 - Venda concessionária'],
  ['FaturamentoDiretoConsumidorFinal', '2 - Faturamento direto para consumidor final'],
  ['VendaDiretaGrandesConsumidores', '3 - Venda direta para grandes consumidores'],
  ['Outros', '0 - Outros'],
]

export const OPCOES_COR_DENATRAN: [string, string][] = [
  ['Amarelo', '01 - Amarelo'], ['Azul', '02 - Azul'], ['Bege', '03 - Bege'], ['Branca', '04 - Branca'],
  ['Cinza', '05 - Cinza'], ['Dourada', '06 - Dourada'], ['Grena', '07 - Grená'], ['Laranja', '08 - Laranja'],
  ['Marrom', '09 - Marrom'], ['Prata', '10 - Prata'], ['Preta', '11 - Preta'], ['Rosa', '12 - Rosa'],
  ['Roxa', '13 - Roxa'], ['Verde', '14 - Verde'], ['Vermelha', '15 - Vermelha'], ['Fantasia', '16 - Fantasia'],
]

export const OPCOES_COMBUSTIVEL: [string, string][] = [
  ['06', '06 - Elétrico/fonte interna'],
  ['07', '07 - Elétrico/fonte externa'],
  ['18', '18 - Gasolina/elétrico'],
  ['02', '02 - Gasolina'],
  ['01', '01 - Álcool'],
  ['16', '16 - Álcool/gasolina (flex)'],
  ['11', '11 - Vide campo observação'],
]

export const OPCOES_TIPO_VEICULO: [string, string][] = [
  ['02', '02 - Ciclomotor'],
  ['03', '03 - Motoneta'],
  ['04', '04 - Motocicleta'],
  ['05', '05 - Triciclo'],
  ['21', '21 - Quadriciclo'],
]

export const OPCOES_ESPECIE: [string, string][] = [
  ['Passageiro', '1 - Passageiro'], ['Carga', '2 - Carga'], ['Misto', '3 - Misto'],
  ['Corrida', '4 - Corrida'], ['Tracao', '5 - Tração'], ['Especial', '6 - Especial'],
]

// tpPint (J18 do leiaute, MOC): 1 caractere sem lista de valores na SEFAZ. A nota da
// fábrica traz 'A', fora do S/M/P usual; então só sugere, não restringe.
export const SUGESTOES_PINTURA: [string, string][] = [['S', 'Sólida'], ['M', 'Metálica'], ['P', 'Perolizada'], ['A', 'Como na nota da fábrica']]

export const OPCOES_CONDICAO_VIN: [string, string][] = [['Normal', 'N - Normal'], ['Remarcado', 'R - Remarcado']]

export const OPCOES_CONDICAO: [string, string][] = [['Acabado', '1 - Acabado'], ['Inacabado', '2 - Inacabado'], ['SemiAcabado', '3 - Semiacabado']]

export const OPCOES_RESTRICAO: [string, string][] = [
  ['NaoHa', '0 - Não há'],
  ['AlienacaoFiduciaria', '1 - Alienação fiduciária'],
  ['ArrendamentoMercantil', '2 - Arrendamento mercantil'],
  ['ReservaDominio', '3 - Reserva de domínio'],
  ['PenhorVeiculos', '4 - Penhor de veículos'],
  ['Outras', '9 - Outras'],
]

// pot (veicProd): o leiaute descreve o campo em CV, mas a nota da fábrica manda o valor
// em watts (3000). Por decisão do Luis (29/10) a unidade é escolha da loja; o MOVA
// sugere watts e mostra a conversão.
export const OPCOES_UNIDADE_POTENCIA: [string, string][] = [['W', 'Watts (W)'], ['CV', 'Cavalo-vapor (CV)']]

/** Código de 2 dígitos da tabela DENATRAN, para sugerir o cCor quando não há código da montadora. */
const CODIGO_DENATRAN: Record<string, string> = Object.fromEntries(
  OPCOES_COR_DENATRAN.map(([v, l]) => [v, l.slice(0, 2)]),
)

/** O que a tela edita: tudo texto, como nos inputs. */
export type DadosRenave = {
  chassi: string
  tipoOperacao: string
  corCodigo: string
  corDescricao: string
  corDenatran: string
  potenciaMotor: string
  /** Unidade em que `potenciaMotor` vai no XML: 'W' ou 'CV'. */
  unidadePotencia: string
  cilindradas: string
  pesoLiquido: string
  pesoBruto: string
  numeroSerie: string
  tipoCombustivel: string
  numeroMotor: string
  capacidadeMaximaTracao: string
  distanciaEixos: string
  anoModelo: string
  anoFabricacao: string
  tipoPintura: string
  tipoVeiculo: string
  especie: string
  condicaoVin: string
  condicao: string
  codigoMarcaModelo: string
  lotacao: string
  restricao: string
}

/** O grupo como a API recebe. */
export type VeiculoNovo = {
  tipoOperacao: string
  chassi: string
  cor: { codigo: string; descricao: string; denatran: string }
  potenciaMotor: string
  cilindradas: string
  pesoLiquido: number
  pesoBruto: number
  numeroSerie: string
  tipoCombustivel: string
  numeroMotor: string
  capacidadeMaximaTracao: number
  distanciaEixos: string
  anoModelo: number
  anoFabricacao: number
  tipoPintura: string
  tipoVeiculo: string
  especie: string
  condicaoVin: string
  condicao: string
  codigoMarcaModelo: string
  lotacao: number
  restricao: string
}

export function exigeRenave(categoria: string | null | undefined): boolean {
  return categoria === 'ciclomotor'
}

export function normalizarChassi(chassi: string): string {
  return chassi.replace(/\s/g, '').toUpperCase()
}

/** O RENAVE não aceita chassi fora do padrão VIN. */
export function chassiValidoRenave(chassi: string): boolean {
  return /^[A-Z0-9]{17}$/.test(normalizarChassi(chassi))
}

const SEM_ACENTO = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/** Palavra da cor cadastrada → cor DENATRAN. "Grafite" e "chumbo" são cinza; o resto vira Fantasia. */
export function corDenatranSugerida(cor: string | null | undefined): string {
  const c = SEM_ACENTO(cor ?? '')
  const regras: [RegExp, string][] = [
    [/PRET|BLACK/, 'Preta'],
    [/BRANC|WHITE/, 'Branca'],
    [/PRAT|SILVER/, 'Prata'],
    [/CINZ|GRAFIT|CHUMBO|GRAY|GREY/, 'Cinza'],
    [/VERMELH|RED/, 'Vermelha'],
    [/AZUL|BLUE/, 'Azul'],
    [/VERDE|GREEN/, 'Verde'],
    [/AMAREL|YELLOW/, 'Amarelo'],
    [/LARANJ|ORANGE/, 'Laranja'],
    [/ROS[AE]|PINK/, 'Rosa'],
    [/ROX|LILAS|PURPLE/, 'Roxa'],
    [/MARROM|BROWN/, 'Marrom'],
    [/BEGE/, 'Bege'],
    [/DOURAD|GOLD/, 'Dourada'],
    [/GRENA|VINHO/, 'Grena'],
  ]
  return regras.find(([re]) => re.test(c))?.[1] ?? 'Fantasia'
}

/** "1000W", "1.000 W", "2kW" → watts. null quando não dá para ler. */
function lerWatts(potenciaW: string | null | undefined): number | null {
  const t = (potenciaW ?? '').toUpperCase().replace(/\s/g, '')
  const m = t.match(/^([\d.,]+)(KW|W)?/)
  if (!m) return null
  const n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return m[2] === 'KW' ? n * 1000 : n
}

const WATTS_POR_CV = 735.5

/** Watts inteiros, até 4 caracteres como o campo pot. Vazio quando não cabe ou não dá para ler. */
export function potenciaWSugerida(potenciaW: string | null | undefined): string {
  const w = lerWatts(potenciaW)
  if (w == null) return ''
  const s = String(Math.round(w))
  return s.length <= 4 ? s : ''
}

/** A potência do modelo na unidade escolhida. */
export function potenciaNaUnidade(potenciaW: string | null | undefined, unidade: string): string {
  return unidade === 'CV' ? potenciaCvSugerida(potenciaW) : unidade === 'W' ? potenciaWSugerida(potenciaW) : ''
}

/** Valor digitado numa unidade → o mesmo na outra ('' se não dá para ler). Para a tela trocar e mostrar a equivalência. */
export function converterPotencia(valor: string, de: string, para: string): string {
  if (de === para) return valor
  const n = Number(valor.trim().replace(',', '.'))
  if (!valor.trim() || !Number.isFinite(n) || n <= 0) return ''
  return para === 'CV' ? potenciaCvSugerida(`${n}W`) : potenciaWSugerida(`${n * WATTS_POR_CV}W`)
}

/** "1000W", "1.000 W", "2kW" → CV com até 4 caracteres ("1.36"). Vazio quando não dá para ler. */
export function potenciaCvSugerida(potenciaW: string | null | undefined): string {
  const watts = lerWatts(potenciaW)
  if (watts == null) return ''
  const cv = watts / WATTS_POR_CV
  for (const casas of [2, 1, 0]) {
    const s = String(Number(cv.toFixed(casas)))
    if (s.length <= 4) return s
  }
  return ''
}

/**
 * O que é do modelo, e por isso vem da última moto do mesmo modelo. Tipo da
 * operação e restrição são da venda: herdar levaria a alienação fiduciária de
 * uma venda financiada para a próxima moto.
 */
const MEDIDAS_DO_MODELO = [
  'potenciaMotor', 'unidadePotencia', 'pesoLiquido', 'pesoBruto',
  'capacidadeMaximaTracao', 'distanciaEixos', 'codigoMarcaModelo', 'lotacao',
] as const satisfies readonly (keyof DadosRenave)[]

/**
 * Valores de tabela que também vêm da última moto do mesmo modelo (Luis, 29/10).
 * Separados das medidas para a decisão poder mudar só aqui: tirar daqui deixa
 * estes campos vazios em toda venda.
 */
const TABELA_DO_MODELO = [
  'cilindradas', 'tipoCombustivel', 'tipoVeiculo', 'especie', 'condicao', 'condicaoVin',
] as const satisfies readonly (keyof DadosRenave)[]

const CAMPOS_DO_MODELO = [...MEDIDAS_DO_MODELO, ...TABELA_DO_MODELO]

/** De onde veio cada valor sugerido, em texto curto para a tela. Campo sem origem: a loja preenche. */
export type OrigemRenave = Partial<Record<keyof DadosRenave, string>>

/** As etapas do formulário, na ordem da tela. Todo campo do RENAVE está em exatamente uma. */
export const PARTES_RENAVE = [
  { id: 'moto', nome: 'Desta moto', campos: ['chassi', 'numeroMotor', 'numeroSerie', 'anoFabricacao', 'anoModelo', 'corDescricao', 'corDenatran', 'corCodigo', 'tipoPintura'] },
  { id: 'modelo', nome: 'Do modelo', campos: [
    'codigoMarcaModelo', 'tipoVeiculo', 'especie', 'tipoCombustivel', 'potenciaMotor', 'unidadePotencia', 'cilindradas',
    'pesoLiquido', 'pesoBruto', 'capacidadeMaximaTracao', 'distanciaEixos', 'lotacao',
  ] },
  { id: 'operacao', nome: 'Da operação', campos: ['tipoOperacao', 'restricao', 'condicao', 'condicaoVin'] },
] as const satisfies readonly { id: string; nome: string; campos: readonly (keyof DadosRenave)[] }[]

export type ParteRenave = (typeof PARTES_RENAVE)[number]['id']

/** Quantos campos faltam em cada etapa. */
export function faltandoPorParte(d: DadosRenave): Record<ParteRenave, number> {
  const vazios = new Set(camposFaltando(d))
  return Object.fromEntries(PARTES_RENAVE.map(p => [p.id, p.campos.filter(k => vazios.has(k)).length])) as Record<ParteRenave, number>
}

/** Campos ainda vazios: a nota não sai sem eles. */
export function camposFaltando(d: DadosRenave): (keyof DadosRenave)[] {
  return (Object.keys(d) as (keyof DadosRenave)[]).filter(k => !String(d[k] ?? '').trim())
}

/**
 * Pré-preenche o formulário. O que é da moto sai do cadastro dela; o que é do
 * modelo sai da última moto do mesmo modelo. Valor de tabela (operação, combustível,
 * restrição etc.) o MOVA não supõe: cada loja tem a sua prática, então na primeira
 * moto fica em branco e a loja escolhe.
 */
export function sugestaoRenave(m: Parameters<typeof sugestaoComOrigem>[0]): DadosRenave {
  return sugestaoComOrigem(m).dados
}

/** A sugestão e a origem de cada valor, para a tela mostrar ao lado do campo. */
export function sugestaoComOrigem(m: {
  chassi: string
  cor: string | null
  motor: string | null
  potenciaW: string | null
  anoAtual: number
  anterior?: DadosRenave | null
  /** tpPint da nota de entrada da moto. */
  tpPintEntrada?: string | null
  /** Nome do modelo, para dizer "da última X11-12". */
  modeloNome?: string | null
}): { dados: DadosRenave; origem: OrigemRenave } {
  const chassi = normalizarChassi(m.chassi)
  const denatran = corDenatranSugerida(m.cor)
  const base: DadosRenave = {
    chassi,
    tipoOperacao: '',
    corCodigo: CODIGO_DENATRAN[denatran],
    corDescricao: (m.cor ?? '').trim().toUpperCase().slice(0, 40),
    corDenatran: denatran,
    potenciaMotor: '',
    unidadePotencia: '',
    cilindradas: '',
    pesoLiquido: '',
    pesoBruto: '',
    // Os últimos 8 do chassi são o sequencial de fabricação (VIN, posições 10 a 17).
    numeroSerie: chassi.slice(-8),
    tipoCombustivel: '',
    numeroMotor: (m.motor ?? '').trim().toUpperCase(),
    capacidadeMaximaTracao: '',
    distanciaEixos: '',
    anoModelo: String(m.anoAtual),
    anoFabricacao: String(m.anoAtual),
    tipoPintura: '',
    tipoVeiculo: '',
    especie: '',
    condicaoVin: '',
    condicao: '',
    codigoMarcaModelo: '',
    lotacao: '',
    restricao: '',
  }
  const s: DadosRenave = { ...base }
  if (m.anterior) Object.assign(s, Object.fromEntries(CAMPOS_DO_MODELO.map(k => [k, m.anterior![k]])))
  // Watts é a sugestão inicial (é o que a fábrica manda).
  if (!s.unidadePotencia) s.unidadePotencia = 'W'
  if (!m.anterior) s.potenciaMotor = potenciaNaUnidade(m.potenciaW, s.unidadePotencia)
  // Pintura é da moto: vem da nota de entrada dela, não da moto anterior.
  const pintEntrada = (m.tpPintEntrada ?? '').trim().toUpperCase()
  if (pintEntrada.length === 1) s.tipoPintura = pintEntrada

  const origem: OrigemRenave = {}
  const marcar = (campos: readonly (keyof DadosRenave)[], texto: string) => {
    for (const k of campos) if (String(s[k]).trim()) origem[k] = texto
  }
  marcar(['chassi', 'numeroMotor', 'anoFabricacao', 'anoModelo', 'corDescricao', 'corDenatran'], 'da moto')
  marcar(['corCodigo'], 'da cor DENATRAN')
  marcar(['numeroSerie'], 'final do chassi')
  if (pintEntrada.length === 1) origem.tipoPintura = 'da nota de entrada da moto'
  if (m.anterior) marcar(CAMPOS_DO_MODELO, `da última ${(m.modeloNome ?? '').trim() || 'moto do modelo'}`)
  else {
    marcar(['potenciaMotor'], 'do cadastro do modelo')
    origem.unidadePotencia = 'sugerido'
  }
  return { dados: s, origem }
}

const valores = (opcoes: [string, string][]) => new Set(opcoes.map(([v]) => v))

/** Número decimal em toneladas, aceitando vírgula. Até 4 casas, como o leiaute. */
function toneladas(s: string, aceitaZero = false): number | null {
  const t = s.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 || (aceitaZero && n === 0) ? n : null
}

/**
 * Confere e normaliza o que a tela mandou. Cada erro diz o campo como está na
 * tela; o leiaute é todo 1-1, então nada pode faltar.
 */
export function validarRenave(d: DadosRenave): { ok: true; dados: DadosRenave } | { ok: false; error: string } {
  const erros: string[] = []
  const txt = (v: string, max: number, nome: string) => {
    const s = (v ?? '').trim().toUpperCase()
    if (!s) erros.push(`${nome}: obrigatório`)
    else if (s.length > max) erros.push(`${nome}: até ${max} caracteres`)
    return s
  }
  const opcao = (v: string, opcoes: [string, string][], nome: string) => {
    if (!valores(opcoes).has(v)) erros.push(`${nome}: escolha uma opção`)
    return v
  }

  const pesoL = toneladas(d.pesoLiquido)
  if (pesoL == null) erros.push('Peso líquido: em toneladas, até 4 casas (ex.: 0,0850)')
  const pesoB = toneladas(d.pesoBruto)
  if (pesoB == null) erros.push('Peso bruto: em toneladas, até 4 casas (ex.: 0,2350)')
  // CMT 0 é válido: ciclomotor que não traciona reboque.
  const cmt = toneladas(d.capacidadeMaximaTracao, true)
  if (cmt == null) erros.push('Capacidade máxima de tração: em toneladas, até 4 casas')

  const anoFab = Number(d.anoFabricacao)
  const anoMod = Number(d.anoModelo)
  if (!/^\d{4}$/.test(d.anoFabricacao.trim())) erros.push('Ano de fabricação: 4 dígitos')
  if (!/^\d{4}$/.test(d.anoModelo.trim())) erros.push('Ano do modelo: 4 dígitos')
  else if (anoMod !== anoFab && anoMod !== anoFab + 1) erros.push('Ano do modelo: igual ao de fabricação ou um ano depois')

  const lotacao = d.lotacao.trim()
  if (!/^\d{1,3}$/.test(lotacao) || Number(lotacao) < 1) erros.push('Lotação: número de passageiros, até 3 dígitos')

  const cMod = d.codigoMarcaModelo.replace(/\D/g, '')
  if (!cMod || cMod.length > 6) erros.push('Código marca/modelo RENAVAM: até 6 dígitos')

  const chassi = normalizarChassi(d.chassi ?? '')
  if (!chassiValidoRenave(chassi)) erros.push('Chassi: 17 letras e números')

  const dados: DadosRenave = {
    chassi,
    tipoOperacao: opcao(d.tipoOperacao, OPCOES_TIPO_OPERACAO, 'Tipo da operação'),
    corCodigo: txt(d.corCodigo, 4, 'Código da cor'),
    corDescricao: txt(d.corDescricao, 40, 'Descrição da cor'),
    corDenatran: opcao(d.corDenatran, OPCOES_COR_DENATRAN, 'Cor DENATRAN'),
    potenciaMotor: txt(d.potenciaMotor.replace(',', '.'), 4, 'Potência'),
    unidadePotencia: opcao(d.unidadePotencia, OPCOES_UNIDADE_POTENCIA, 'Unidade da potência'),
    cilindradas: txt(d.cilindradas, 4, 'Cilindradas'),
    pesoLiquido: d.pesoLiquido.trim().replace(',', '.'),
    pesoBruto: d.pesoBruto.trim().replace(',', '.'),
    numeroSerie: txt(d.numeroSerie, 9, 'Número de série'),
    tipoCombustivel: opcao(d.tipoCombustivel, OPCOES_COMBUSTIVEL, 'Combustível'),
    numeroMotor: txt(d.numeroMotor, 21, 'Número do motor'),
    capacidadeMaximaTracao: d.capacidadeMaximaTracao.trim().replace(',', '.'),
    distanciaEixos: txt(d.distanciaEixos, 4, 'Distância entre eixos'),
    anoModelo: d.anoModelo.trim(),
    anoFabricacao: d.anoFabricacao.trim(),
    tipoPintura: txt(d.tipoPintura, 1, 'Tipo de pintura'),
    tipoVeiculo: opcao(d.tipoVeiculo, OPCOES_TIPO_VEICULO, 'Tipo de veículo'),
    especie: opcao(d.especie, OPCOES_ESPECIE, 'Espécie'),
    condicaoVin: opcao(d.condicaoVin, OPCOES_CONDICAO_VIN, 'Condição do VIN'),
    condicao: opcao(d.condicao, OPCOES_CONDICAO, 'Condição do veículo'),
    codigoMarcaModelo: cMod,
    lotacao,
    restricao: opcao(d.restricao, OPCOES_RESTRICAO, 'Restrição'),
  }
  if (pesoL != null && pesoB != null && pesoB < pesoL) erros.push('Peso bruto: não pode ser menor que o líquido')

  return erros.length ? { ok: false, error: erros.join('\n') } : { ok: true, dados }
}

/** A tela mostra o código da tabela com 2 dígitos; o exemplo de payload da NG (Hermes, 27/10) manda sem o zero. */
const semZeroAEsquerda = (codigo: string) => String(Number(codigo))

/** Dados já validados → grupo `veiculoNovo` da API. */
export function montarVeiculoNovo(d: DadosRenave): VeiculoNovo {
  return {
    tipoOperacao: d.tipoOperacao,
    chassi: normalizarChassi(d.chassi),
    cor: { codigo: d.corCodigo, descricao: d.corDescricao, denatran: d.corDenatran },
    potenciaMotor: d.potenciaMotor,
    cilindradas: d.cilindradas,
    pesoLiquido: Number(d.pesoLiquido),
    pesoBruto: Number(d.pesoBruto),
    numeroSerie: d.numeroSerie,
    tipoCombustivel: semZeroAEsquerda(d.tipoCombustivel),
    numeroMotor: d.numeroMotor,
    capacidadeMaximaTracao: Number(d.capacidadeMaximaTracao),
    distanciaEixos: d.distanciaEixos,
    anoModelo: Number(d.anoModelo),
    anoFabricacao: Number(d.anoFabricacao),
    tipoPintura: d.tipoPintura,
    tipoVeiculo: semZeroAEsquerda(d.tipoVeiculo),
    especie: d.especie,
    condicaoVin: d.condicaoVin,
    condicao: d.condicao,
    codigoMarcaModelo: d.codigoMarcaModelo,
    lotacao: Number(d.lotacao),
    restricao: d.restricao,
  }
}

/**
 * A checagem do RENAVE antes de emitir. Fica fora da action para o "Salvar e reenviar"
 * recusar antes de gravar a correção: senão a correção ficava gravada sem nota nenhuma.
 */
export function conferirRenave(
  exigido: boolean,
  renave: DadosRenave | null | undefined,
): { ok: true; dados: DadosRenave | null } | { ok: false; error: string } {
  if (!exigido) return { ok: true, dados: null }
  if (!renave) return { ok: false, error: 'Ciclomotor sem os dados do veículo (RENAVE). Preencha antes de transmitir.' }
  const v = validarRenave(renave)
  return v.ok ? v : { ok: false, error: `Dados do veículo (RENAVE):\n${v.error}` }
}

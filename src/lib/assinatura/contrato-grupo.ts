import { formatarCpfCnpj } from '@/lib/documento'
import {
  descreverPagamentos, esc, ITENS_CARTILHA_BATERIA, qualificacaoCompradorEmLinha, type DadosDocumento,
} from './documento'

/**
 * Contrato que cada grupo cola na tela, com campos {assim} que o MOVA preenche pela venda.
 * O texto é do grupo; o MOVA só põe os dados e a marcação mínima (título, parágrafo, lista,
 * negrito). Nada do texto vira HTML: tudo é escapado antes da marcação.
 */
export const CAMPOS_CONTRATO = [
  { chave: 'comprador_qualificacao', rotulo: 'Qualificação do comprador (pessoa física ou empresa)' },
  { chave: 'cliente_nome', rotulo: 'Nome do cliente' },
  { chave: 'cliente_cpf', rotulo: 'CPF ou CNPJ do cliente' },
  { chave: 'cliente_endereco', rotulo: 'Endereço do cliente' },
  { chave: 'cliente_email', rotulo: 'E-mail do cliente' },
  { chave: 'marca', rotulo: 'Marca' },
  { chave: 'modelo', rotulo: 'Modelo' },
  { chave: 'cor', rotulo: 'Cor' },
  { chave: 'chassi', rotulo: 'Chassi' },
  { chave: 'valor', rotulo: 'Valor (12.990,00)' },
  { chave: 'valor_extenso', rotulo: 'Valor por extenso' },
  { chave: 'pagamentos', rotulo: 'Formas de pagamento' },
  { chave: 'loja_razao_social', rotulo: 'Razão social da empresa' },
  { chave: 'loja_cnpj', rotulo: 'CNPJ da empresa' },
  { chave: 'loja_endereco', rotulo: 'Endereço da sede' },
  { chave: 'comarca', rotulo: 'Comarca do foro' },
  { chave: 'cidade', rotulo: 'Cidade da sede' },
  { chave: 'data', rotulo: 'Data da venda' },
  { chave: 'cartilha_bateria', rotulo: 'Cartilha da bateria do MOVA (lista)' },
] as const

export type CampoContrato = (typeof CAMPOS_CONTRATO)[number]['chave']
const CHAVES = new Set<string>(CAMPOS_CONTRATO.map(c => c.chave))

// Qualquer coisa entre chaves conta como campo: {Cliente Nome} digitado errado tem de aparecer.
const RE_CAMPO = /\{([^{}\n]*)\}/g

// Sem estes o contrato não identifica quem compra, o quê, nem por quanto.
const OBRIGATORIOS: { nome: string; algum: CampoContrato[] }[] = [
  { nome: 'comprador', algum: ['comprador_qualificacao', 'cliente_nome'] },
  { nome: 'chassi', algum: ['chassi'] },
  { nome: 'valor', algum: ['valor', 'valor_extenso'] },
]

export const TAMANHO_MAX_CONTRATO = 100_000

export type ValidacaoContrato =
  | { ok: true }
  | { ok: false; erro: string; desconhecidos: string[]; faltando: string[] }

export function validarTextoContrato(texto: string): ValidacaoContrato {
  if (!texto.trim()) return { ok: false, erro: 'Cole o texto do contrato', desconhecidos: [], faltando: [] }
  if (texto.length > TAMANHO_MAX_CONTRATO) {
    return { ok: false, erro: 'O texto passou do tamanho máximo de um contrato', desconhecidos: [], faltando: [] }
  }
  const usados = [...texto.matchAll(RE_CAMPO)]
  const desconhecidos = [...new Set(usados.filter(m => !CHAVES.has(m[1])).map(m => m[0]))]
  const presentes = new Set(usados.map(m => m[1]))
  const faltando = OBRIGATORIOS.filter(o => !o.algum.some(c => presentes.has(c))).map(o => o.nome)
  if (!desconhecidos.length && !faltando.length) return { ok: true }
  const partes = [
    desconhecidos.length ? `campo desconhecido: ${desconhecidos.join(', ')}` : '',
    faltando.length ? `falta no texto: ${faltando.join(', ')}` : '',
  ].filter(Boolean)
  return { ok: false, erro: `Não dá para salvar. ${partes.join('; ')}`, desconhecidos, faltando }
}

/** Valor de cada campo, já escapado. Os de lista têm versão em linha e em bloco. */
function valoresDosCampos(d: DadosDocumento): Record<CampoContrato, string> {
  return {
    comprador_qualificacao: qualificacaoCompradorEmLinha(d),
    cliente_nome: esc(d.clienteNome),
    cliente_cpf: esc(formatarCpfCnpj(d.clienteCpf)),
    cliente_endereco: esc(d.clienteEndereco),
    cliente_email: esc(d.clienteEmail),
    marca: esc(d.marca),
    modelo: esc(d.modelo),
    cor: esc(d.cor),
    chassi: esc(d.chassi),
    valor: esc(d.valor),
    valor_extenso: esc(valorPorExtenso(d.valor)),
    pagamentos: descreverPagamentos(d.pagamentos, d.formaPagamento).map(esc).join('; '),
    loja_razao_social: esc(d.vendedoraRazaoSocial),
    loja_cnpj: esc(formatarCpfCnpj(d.vendedoraCnpj)),
    loja_endereco: esc(d.vendedoraEndereco),
    comarca: esc(d.comarcaForo),
    cidade: esc(d.cidadeSede),
    data: esc(d.dataVenda),
    cartilha_bateria: ITENS_CARTILHA_BATERIA.map(esc).join('; '),
  }
}

function lista(itens: string[]): string {
  return `<ul>${itens.map(i => `<li>${i}</li>`).join('')}</ul>`
}

/**
 * Texto do grupo → HTML do documento. Cada linha é um parágrafo; "# " e "## " são títulos;
 * "- " ou "• " são itens de lista; **x** é negrito. Campo desconhecido sai marcado (só a
 * prévia chega a ter um: salvar recusa).
 */
export function renderizarContratoGrupo(texto: string, d: DadosDocumento): string {
  const valores = valoresDosCampos(d)
  const blocos: Partial<Record<CampoContrato, string>> = {
    pagamentos: lista(descreverPagamentos(d.pagamentos, d.formaPagamento).map(esc)),
    cartilha_bateria: lista(ITENS_CARTILHA_BATERIA.map(esc)),
    comprador_qualificacao: `<p>${valores.comprador_qualificacao}</p>`,
  }
  // Escapa, aplica negrito e só então troca os campos numa passada: o dado da venda não é
  // relido como marcação nem como campo.
  const linha = (bruta: string) => esc(bruta)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(RE_CAMPO, (m, chave: string) =>
      CHAVES.has(chave) ? valores[chave as CampoContrato] : `<mark>${m}</mark>`)

  const saida: string[] = []
  let itens: string[] = []
  const fecharLista = () => { if (itens.length) { saida.push(lista(itens)); itens = [] } }

  for (const crua of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const l = crua.trim()
    const item = /^[-•]\s+(.*)$/.exec(l)
    if (item) { itens.push(linha(item[1])); continue }
    fecharLista()
    if (!l) continue
    const sozinho = /^\{([a-z_]+)\}$/.exec(l)?.[1] as CampoContrato | undefined
    if (sozinho && blocos[sozinho]) saida.push(blocos[sozinho]!)
    else if (l.startsWith('## ')) saida.push(`<h2>${linha(l.slice(3))}</h2>`)
    else if (l.startsWith('# ')) saida.push(`<h1>${linha(l.slice(2))}</h1>`)
    else saida.push(`<p>${linha(l)}</p>`)
  }
  fecharLista()
  return saida.join('\n')
}

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100), r = n % 100
  const resto = r < 20 ? UNIDADES[r] : [DEZENAS[Math.floor(r / 10)], UNIDADES[r % 10]].filter(Boolean).join(' e ')
  return [CENTENAS[c], resto].filter(Boolean).join(' e ')
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  const grupos: [number, string, string][] = [
    [Math.floor(n / 1e9) % 1000, 'bilhão', 'bilhões'],
    [Math.floor(n / 1e6) % 1000, 'milhão', 'milhões'],
    [Math.floor(n / 1e3) % 1000, 'mil', 'mil'],
    [n % 1000, '', ''],
  ]
  const partes = grupos.filter(([v]) => v > 0).map(([v, um, varios]) => {
    if (um === 'mil') return v === 1 ? 'mil' : `${ate999(v)} mil`
    return [ate999(v), v === 1 ? um : varios].filter(Boolean).join(' ')
  })
  // "e" antes do último grupo quando ele é menor que cem ou é centena redonda (mil e cem, mil e um).
  const ultimo = grupos.filter(([v]) => v > 0).at(-1)![0]
  if (partes.length > 1 && (ultimo < 100 || ultimo % 100 === 0)) {
    return `${partes.slice(0, -1).join(' ')} e ${partes.at(-1)}`
  }
  return partes.join(' ')
}

/** "12.990,50" (o valor como o contrato já mostra) → "doze mil novecentos e noventa reais e cinquenta centavos". */
export function valorPorExtenso(valor: string): string {
  const numero = Number(valor.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(numero) || numero < 0) return ''
  const centavosTotal = Math.round(numero * 100)
  const reais = Math.floor(centavosTotal / 100), centavos = centavosTotal % 100
  const redondo = reais > 0 && reais % 1_000_000 === 0
  const textoReais = `${inteiroPorExtenso(reais)}${redondo ? ' de' : ''} ${reais === 1 || reais === 0 ? 'real' : 'reais'}`
  if (!centavos) return textoReais
  const textoCentavos = `${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`
  return reais ? `${textoReais} e ${textoCentavos}` : textoCentavos
}

// Título colado do Word: linha curta, toda em caixa alta e sem ponto final. Parágrafo de
// aviso em caixa alta (o "A MAIORIA DOS ACIDENTES..." da cartilha) fica como parágrafo.
function pareceTitulo(l: string): boolean {
  return l.length <= 80 && !/[.:;]$/.test(l) && /\p{Lu}/u.test(l) && l === l.toLocaleUpperCase('pt-BR')
}

/**
 * Texto colado do Word → a marcação da tela: marcadores viram "- ", título vira "# ",
 * linhas em branco repetidas viram uma. O sócio ajusta o que a regra errar.
 */
export function textoColadoParaMarcacao(colado: string): string {
  const linhas = colado.replace(/\r\n?/g, '\n').split('\n').map(l => {
    const t = l.trim()
    // Travessão (–) fica de fora: no contrato ele separa título e texto da cláusula.
    const item = /^(?:[•◦▪·●○■*]\s*|-\s+)(.*)$/u.exec(t)
    if (item) return `- ${item[1].trim()}`
    if (!t || t.startsWith('#') || t.startsWith('{')) return t
    return pareceTitulo(t) ? `# ${t}` : t
  })
  return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Cola no cursor. Trecho de várias linhas ganha linhas próprias: sem isso o título colado
 * grudava no fim do parágrafo de cima e deixava de ser título.
 */
export function colarNoTexto(texto: string, ini: number, fim: number, colado: string): { texto: string; cursor: number } {
  const trecho = textoColadoParaMarcacao(colado)
  const variasLinhas = trecho.includes('\n')
  const antes = variasLinhas && ini > 0 && texto[ini - 1] !== '\n' ? '\n' : ''
  const depois = variasLinhas && fim < texto.length && texto[fim] !== '\n' ? '\n' : ''
  // O cursor fica no fim do trecho colado, antes da quebra que separa o resto da linha.
  const cursor = ini + antes.length + trecho.length
  return { texto: texto.slice(0, ini) + antes + trecho + depois + texto.slice(fim), cursor }
}

/**
 * Lote de entrada a partir dos XMLs de NF-e, escolhendo QUAIS motos das notas entram.
 *
 * A tela de Entrada carrega todas as motos de cada XML. No onboarding de uma loja as notas
 * de compra trazem também motos que estão em outra loja ou já foram vendidas, e o chassi
 * gravado às vezes difere do que está no XML: a carta de correção troca o chassi e o XML
 * continua com o antigo. Aqui a pessoa diz quais chassis entram (e, se for o caso, com
 * qual chassi o XML os conhece), e o resto segue a regra da tela: cor e motor do XML,
 * modelo pelo de-para da nota, ficha fiscal por chassi, preço de compra confirmado.
 *
 * Puro (sem banco). A gravação é a do gravarLoteDeEntrada (src/lib/entrada-motos.ts).
 */
import { decodificarEntidadesXml, extrairDaNfe, mapearModelo, parseMotosInfCpl, type MotoNfe } from './nfe-entrada'
import {
  extrairCnpjDoDestinatario, extrairEmitenteDaNfe, extrairFiscalDaNfe, ligarFichasAosChassis,
  type EmitenteNfe, type FichaDaMoto, type FichaFiscal, type NomeDeModelo,
} from './nfe-fiscal'
import { casarModelo, precoDaPlanilha, type ModeloSugestao } from './entrada-preco'
import type { MotoEntradaLote } from './entrada-motos'
import { soDigitosDoc } from './documento'

/** Id do modelo cadastrado para o nome que veio na nota, ou '' (o mesmo de-para da tela). */
export function modeloDaNota(nomeNaNota: string, modelos: ModeloSugestao[]): string {
  const nome = mapearModelo(nomeNaNota, modelos.map(m => m.modelo)) ?? nomeNaNota
  return casarModelo(nome, modelos)
}

export type MotoEscolhida = {
  /** Chassi que vai para o MOVA: o da moto (o corrigido, se houve carta de correção). */
  chassi: string
  /** Chassi como está no XML, quando difere do da moto (carta de correção). */
  chassiNaNota?: string
  /** Nome do modelo no catálogo, para quando o de-para da nota não acha. */
  modelo?: string
  /** Preço de compra confirmado ('6400.00'). */
  precoCompra: string
}

export type PlanoDeEntrada = {
  motos: MotoEntradaLote[]
  fiscais: FichaDaMoto[]
  /** Motivo de cada moto escolhida que não entra no lote. */
  problemas: string[]
  /** Moto que entra, mas sem ficha fiscal: a emissão da NF vai pedir conferência. */
  semFicha: string[]
  /** CNPJ que comprou cada moto do lote (destinatário da nota), na ordem de `motos`. */
  compradores: { chassi: string; cnpj: string }[]
}

type MotoDaNota = { moto: MotoNfe; nNF: string; emitente: EmitenteNfe; comprador: string; ficha?: FichaFiscal }

const chave = (s: string) => s.trim().toUpperCase()

export function planejarEntradaDeXmls(
  xmls: string[],
  escolhidas: MotoEscolhida[],
  modelos: ModeloSugestao[],
  apelidos: NomeDeModelo[] = [],
): PlanoDeEntrada {
  const daNota = new Map<string, MotoDaNota[]>()
  for (const xml of xmls) {
    const { nNF, infCpl } = extrairDaNfe(xml)
    // O infCpl vem com as entidades do XML: o `;` de um &quot; cortaria a moto ao meio.
    const motos = parseMotosInfCpl(decodificarEntidadesXml(infCpl))
    const emitente = extrairEmitenteDaNfe(xml)
    const comprador = extrairCnpjDoDestinatario(xml)
    const fichas = ligarFichasAosChassis(motos, extrairFiscalDaNfe(xml), [...modelos.map(m => m.modelo), ...apelidos])
    for (const moto of motos) {
      const k = chave(moto.chassi)
      daNota.set(k, [...(daNota.get(k) ?? []), { moto, nNF, emitente, comprador, ficha: fichas.get(k) }])
    }
  }

  const plano: PlanoDeEntrada = { motos: [], fiscais: [], problemas: [], semFicha: [], compradores: [] }
  const vistos = new Set<string>()
  // Moto do XML já usada por outra linha (chassi da nota → chassi que entra): sem isso, uma
  // carta de correção mais o chassi antigo na lista gravariam a mesma moto duas vezes.
  const usadasDaNota = new Map<string, string>()
  for (const e of escolhidas) {
    const chassi = chave(e.chassi)
    const naNota = chave(e.chassiNaNota || e.chassi)
    if (!chassi) continue
    if (vistos.has(chassi)) { plano.problemas.push(`${chassi}: repetido na lista`); continue }
    vistos.add(chassi)

    const achados = daNota.get(naNota) ?? []
    if (achados.length === 0) { plano.problemas.push(`${chassi}: chassi ${naNota} não está em nenhum XML`); continue }
    if (achados.length > 1) {
      plano.problemas.push(`${chassi}: aparece em mais de uma nota (${achados.map(a => a.nNF).join(', ')})`)
      continue
    }
    const jaUsadaPor = usadasDaNota.get(naNota)
    if (jaUsadaPor) { plano.problemas.push(`${chassi}: a moto ${naNota} do XML já entra como ${jaUsadaPor}`); continue }
    const [{ moto, nNF, emitente, comprador, ficha }] = achados

    const modeloId = e.modelo ? casarModelo(e.modelo, modelos) : modeloDaNota(moto.modelo, modelos)
    if (!modeloId) {
      plano.problemas.push(`${chassi}: modelo "${e.modelo || moto.modelo}" da NF ${nNF} não está no catálogo da Conta`)
      continue
    }
    const precoCompra = e.precoCompra.trim()
    if (!(Number(precoCompra) > 0)) { plano.problemas.push(`${chassi}: preço de compra inválido`); continue }

    usadasDaNota.set(naNota, chassi)
    plano.motos.push({ chassi, cor: moto.cor, motor: moto.motor, modeloId, precoCompra, notaFiscal: nNF })
    plano.compradores.push({ chassi, cnpj: comprador })
    if (ficha) plano.fiscais.push({ chassi, emitente, ficha })
    else plano.semFicha.push(chassi)
  }
  return plano
}

/**
 * Motos do lote compradas por outro CNPJ que o do grupo da loja. A NF de saída sai pelo grupo
 * de entrada da moto (#552); entrar por outro CNPJ é exceção que alguém precisa aceitar (#731).
 */
export function motosDeOutroCnpj(plano: Pick<PlanoDeEntrada, 'compradores'>, cnpjDoGrupo: string): string[] {
  const doGrupo = soDigitosDoc(cnpjDoGrupo)
  return plano.compradores.filter(c => soDigitosDoc(c.cnpj) !== doGrupo).map(c => c.chassi)
}

/**
 * Motivo para recusar a gravação do lote pelo CNPJ comprador, ou null se pode gravar. Compra de
 * outro CNPJ só entra se for do CNPJ aceito explicitamente (exceção da #731); um 3º CNPJ ou nota
 * sem CNPJ no destinatário recusam sempre.
 */
export function recusaPorCnpjComprador(
  plano: Pick<PlanoDeEntrada, 'compradores'>,
  cnpjDoGrupo: string,
  cnpjAceito: string | undefined,
): string | null {
  const deOutro = new Set(motosDeOutroCnpj(plano, cnpjDoGrupo))
  if (!deOutro.size) return null
  const aceito = soDigitosDoc(cnpjAceito)
  if (!aceito) {
    return `${deOutro.size} moto(s) compradas por outro CNPJ que o do grupo. A NF de saída sai pelo grupo de entrada da moto (#552): `
      + 'só com a exceção aceita e o OK do contador, repita com --aceito-cnpj-de-outro-grupo <CNPJ>.'
  }
  const fora = plano.compradores.filter(c => deOutro.has(c.chassi) && soDigitosDoc(c.cnpj) !== aceito)
  if (!fora.length) return null
  return `Compradas por CNPJ que não é o do grupo nem o aceito: ${fora.map(c => `${c.chassi} (comprador ${c.cnpj || 'sem CNPJ'})`).join(', ')}.`
}

/**
 * Lista de chassis do onboarding: CSV com ";" e cabeçalho `chassi;chassi_na_nota;modelo;preco`
 * (colunas em qualquer ordem; só `chassi` e `preco` são obrigatórias). O preço aceita
 * "6400.00" e "6.400,00", como a coluna PREÇO da planilha da tela.
 */
export function lerListaDeChassis(texto: string): MotoEscolhida[] {
  const [cab, ...linhas] = texto.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!cab) return []
  const cols = cab.split(';').map(c => c.trim().toLowerCase())
  if (!cols.includes('chassi') || !cols.includes('preco')) throw new Error('A lista precisa das colunas chassi e preco')
  const col = (cel: string[], nome: string) => (cols.includes(nome) ? (cel[cols.indexOf(nome)] ?? '').trim() : '')
  return linhas.map(l => {
    const cel = l.split(';')
    return {
      chassi: col(cel, 'chassi'),
      chassiNaNota: col(cel, 'chassi_na_nota') || undefined,
      modelo: col(cel, 'modelo') || undefined,
      precoCompra: precoDaPlanilha(col(cel, 'preco')),
    }
  })
}

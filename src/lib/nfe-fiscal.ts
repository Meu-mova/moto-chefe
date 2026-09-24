/**
 * Ficha fiscal dos produtos de uma NF-e de ENTRADA.
 *
 * A tributação de cada produto não vive no MOVA — vive dentro do Bling, que
 * completa NCM, CEST, origem e CST a partir do `blingCodigo`. Para o MOVA
 * emitir nota própria ele precisa desses campos, e a fonte é o XML que já entra
 * pelo módulo Entrada: quem classificou o produto foi o fornecedor, na nota que
 * nos vendeu.
 *
 * A ficha é gravada POR MOTO (tabela `motos_fiscal`), não por modelo. O mesmo
 * modelo comercial vem de CNPJs diferentes com classificação diferente — o X12
 * entra pela LAIOUNS como CEST 2600101 / origem 1 / CST 10 e pela Q.P.A como
 * 2600100 / origem 4 / CST 60 — e a NF de saída espelha a de entrada daquela
 * moto. Ver `ligarFichasAosChassis` e a migração 0103.
 *
 * O que se copia e o que NÃO se copia da entrada:
 * - **Copia**: NCM, CEST, unidade, origem, a classificação IBS/CBS e o nome
 *   fiscal (`xProd`) literal — decisão do Cesar: a saída repete a entrada.
 * - **NÃO copia**: o CFOP. `5405` e `6403` são CFOP de entrada; a saída tem o
 *   seu, que ainda muda por UF do destinatário. Guardado só para conferência.
 * - **Não copia, mas guarda**: o CST do ICMS da entrada. Quando o fornecedor já
 *   recolheu o ST (CST 60) a saída sai CST 60 / CSOSN 500, mas quem decide isso
 *   é o contador, uma vez por grupo/UF, não este parser.
 *
 * O **valor** nunca vem daqui: a nota da fábrica sai com valor diferente do que
 * se paga a ela, então o preço de compra continua sendo o digitado na tela.
 */

import { mapearModelo } from './nfe-entrada'

export type FichaFiscal = {
  /** `cProd` — código do produto na nota do fornecedor. É por ele que se acha o modelo. */
  codigo: string
  descricao: string
  ncm: string
  cest: string
  /** CFOP da ENTRADA. Não serve para emitir saída — ver nota acima. */
  cfopEntrada: string
  unidade: string
  /** `orig` do ICMS: 0 = nacional, 1 = importado direto, 4 = produzido conforme PPB… */
  origem: string
  /** CST do ICMS na entrada, ou o CSOSN quando o fornecedor é do Simples. */
  cstIcmsEntrada: string
  cstPis: string
  cstCofins: string
  /** `cClassTrib` do grupo IBSCBS — a classificação da reforma tributária. */
  classTribIbsCbs: string
}

const tag = (xml: string, nome: string): string =>
  (xml.match(new RegExp(`<${nome}\\b[^>]*>([^<]*)</${nome}>`)) || [])[1]?.trim() ?? ''

/** Conteúdo de um grupo (`<ICMS>…</ICMS>`), incluindo as tags aninhadas. */
const grupo = (xml: string, nome: string): string =>
  (xml.match(new RegExp(`<${nome}\\b[^>]*>([\\s\\S]*?)</${nome}>`)) || [])[1] ?? ''

/**
 * Lê a ficha fiscal de cada item (`<det>`) de uma NF-e.
 *
 * Item sem NCM é descartado: sem NCM a ficha não emite nota, e gravar meia ficha
 * no modelo esconderia o fato de que ele continua sem tributação.
 */
export function extrairFiscalDaNfe(xml: string): FichaFiscal[] {
  const fichas: FichaFiscal[] = []

  for (const m of (xml ?? '').matchAll(/<det\b[^>]*>([\s\S]*?)<\/det>/g)) {
    const det = m[1]
    const prod = grupo(det, 'prod')
    const imposto = grupo(det, 'imposto')

    const ncm = tag(prod, 'NCM')
    if (!ncm) continue

    // O ICMS vem embrulhado numa variante por situação tributária (ICMS00,
    // ICMS60, ICMSSN102…). Ler de dentro do <ICMS> pai vale para todas, e evita
    // pescar o CST do IPI, que é outro grupo e tem numeração própria.
    const icms = grupo(imposto, 'ICMS')

    fichas.push({
      codigo: tag(prod, 'cProd'),
      descricao: tag(prod, 'xProd'),
      ncm,
      cest: tag(prod, 'CEST'),
      cfopEntrada: tag(prod, 'CFOP'),
      unidade: tag(prod, 'uCom'),
      origem: tag(icms, 'orig'),
      cstIcmsEntrada: tag(icms, 'CST') || tag(icms, 'CSOSN'),
      cstPis: tag(grupo(imposto, 'PIS'), 'CST'),
      cstCofins: tag(grupo(imposto, 'COFINS'), 'CST'),
      classTribIbsCbs: tag(grupo(imposto, 'IBSCBS'), 'cClassTrib'),
    })
  }

  return fichas
}

/**
 * Liga cada chassi da nota à ficha fiscal do item correspondente.
 *
 * Existe porque o mesmo modelo comercial vem de CNPJs diferentes com fichas
 * diferentes: o X12 entra pela LAIOUNS como CEST 2600101 / origem 1 / CST 10 e
 * pela Q.P.A como 2600100 / origem 4 / CST 60. Guardar uma ficha por modelo
 * escolheria uma das duas e emitiria a outra metade do estoque com origem e ST
 * errados. A ficha é da MOTO, e é aqui que ela encontra a sua.
 *
 * As duas pontas da nota falam nomes diferentes. O chassi sai do `infCpl`, onde
 * o modelo vem com a potência colada ("X12-1000W") ou abreviado ("BOB MC"); a
 * ficha sai do `<det>`, onde o código vem como "MT-X12-10" ou "X12 MOTO CHEFE".
 * Por isso o casamento tem duas escadas, da mais confiável para a menos:
 *
 * 1. **Pelo catálogo** — `mapearModelo` resolve os dois lados para o nome
 *    cadastrado no MOVA e eles casam se derem no mesmo modelo. É o caminho que
 *    liga "X12-1000W" a "X12 MOTO CHEFE", que nenhuma comparação de texto entre
 *    os dois acertaria.
 * 2. **Por prefixo compactado**, nos dois sentidos, sem a potência. Vence o
 *    casamento mais longo, senão JETMAX cairia em JET e X11 MINI em X11-12.
 *
 * Quando nada casa, o chassi fica de fora de propósito: ficha errada emite nota
 * errada, e sem ficha a tela de emissão ainda pede a conferência humana. A única
 * exceção é a nota de um item só, em que não há o que confundir — caso real da
 * LAIOUNS, que às vezes descreve o X12 como "MOTOCICLETA ELETRICA TIPO
 * MOTONETA", sem citar o modelo em lugar nenhum.
 */
export function ligarFichasAosChassis(
  motosDaNota: { modelo: string; chassi: string }[],
  fichas: FichaFiscal[],
  /** Nomes do catálogo (`modelos.modelo`). Sem eles, só a escada 2 funciona. */
  nomesCatalogo: string[] = [],
): Map<string, FichaFiscal> {
  const mapa = new Map<string, FichaFiscal>()
  if (!motosDaNota.length || !fichas.length) return mapa

  // Compacta para comparar e tira a potência do fim: "X12-1000W" e "X12 MOTO
  // CHEFE" viram "X12" e "X12MOTOCHEFE"; "MT-X12-10" vira "X1210".
  const compactar = (s: string) =>
    (s ?? '')
      .toUpperCase()
      .replace(/^MT[\s-]*/, '')
      .replace(/[^A-Z0-9]/g, '')
      .replace(/\d+W$/, '')

  const doCatalogo = (s: string) =>
    nomesCatalogo.length ? mapearModelo(s ?? '', nomesCatalogo) : null

  // NCM 8711 = motocicletas. Serve para não eleger o guarda-sol da nota como
  // "item único" quando a moto não casa pelo nome.
  const deVeiculo = fichas.filter(f => f.ncm.startsWith('8711'))
  const fichaUnica = deVeiculo.length === 1 ? deVeiculo[0] : null

  // Pré-resolve o lado das fichas: o código manda, a descrição é o reforço.
  const resolvidas = fichas.map(f => ({
    ficha: f,
    catalogo: doCatalogo(f.codigo) ?? doCatalogo(f.descricao),
    textos: [f.codigo, f.descricao].map(compactar).filter(Boolean),
  }))

  for (const moto of motosDaNota) {
    const alvo = compactar(moto.modelo)
    const alvoCatalogo = doCatalogo(moto.modelo)
    if (!alvo && !alvoCatalogo) continue

    let melhor: FichaFiscal | null = null
    let melhorNota = 0

    for (const r of resolvidas) {
      // Escada 1: os dois lados apontam para o mesmo modelo cadastrado.
      if (alvoCatalogo && r.catalogo === alvoCatalogo) {
        const nota = 1000 + alvoCatalogo.length
        if (nota > melhorNota) { melhor = r.ficha; melhorNota = nota }
        continue
      }
      // Escada 2: prefixo nos dois sentidos, vence o mais longo.
      for (const t of r.textos) {
        if (!alvo) continue
        const casa = t.startsWith(alvo) || alvo.startsWith(t)
        const nota = Math.min(t.length, alvo.length)
        if (casa && nota > melhorNota) { melhor = r.ficha; melhorNota = nota }
      }
    }

    const escolhida = melhor ?? fichaUnica
    if (escolhida) mapa.set(moto.chassi.trim().toUpperCase(), escolhida)
  }

  return mapa
}

/** Cabeçalho da nota: de quem veio e qual é. Explica duas fichas do mesmo modelo. */
export type EmitenteNfe = { cnpj: string; nome: string; nfNumero: string; nfChave: string }

export function extrairEmitenteDaNfe(xml: string): EmitenteNfe {
  const emit = grupo(xml ?? '', 'emit')
  return {
    cnpj: tag(emit, 'CNPJ'),
    nome: tag(emit, 'xNome'),
    nfNumero: tag(xml ?? '', 'nNF'),
    // O Id do infNFe é "NFe" + os 44 dígitos da chave de acesso.
    nfChave: ((xml ?? '').match(/<infNFe[^>]*\bId="NFe(\d{44})"/) || [])[1] ?? '',
  }
}

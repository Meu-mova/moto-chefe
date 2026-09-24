/**
 * Ficha fiscal dos produtos de uma NF-e de ENTRADA.
 *
 * Hoje a tributação de cada modelo não vive no MOVA — vive dentro do Bling, que
 * completa NCM, CEST, origem e CST a partir do `blingCodigo` do modelo. Para o
 * MOVA emitir nota própria ele precisa desses campos, e a fonte escolhida é o
 * XML que já entra pelo módulo Entrada a cada compra: quem classificou o produto
 * foi a própria fábrica, na nota que nos vendeu.
 *
 * Este módulo só lê o XML. O que fazer com a ficha (gravar no modelo que ainda
 * não tem) é decisão da action da Entrada, no mesmo molde do preço de compra
 * padrão — ver `entrada-preco.ts`.
 *
 * O que se copia e o que NÃO se copia da entrada:
 * - **Copia**: NCM, CEST, unidade, origem e a classificação IBS/CBS. São do
 *   produto, não da operação — valem igual na saída.
 * - **NÃO copia**: o CFOP. `5405` é CFOP de entrada; a saída tem CFOP próprio,
 *   que muda ainda por UF do destinatário. Fica guardado como `cfopEntrada` só
 *   para conferência, nunca para emitir.
 * - **Não copia, mas guarda**: o CST do ICMS da entrada. Quando a fábrica já
 *   recolheu o ST (CST 60, o caso da Q.P.A), a saída sai CST 60 / CSOSN 500 —
 *   mas quem decide isso é o contador, uma vez por grupo/UF, não este parser.
 */

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
 * Uma ficha por modelo, para gravar no catálogo dos que ainda não têm.
 *
 * Mesmo critério do preço padrão (`precosParaCadastrar`): quando o mesmo modelo
 * aparece duas vezes no lote, o primeiro vale — quem conferir o cadastro depois
 * ajusta. Ficha sem NCM não entra: é o campo que torna a ficha utilizável.
 */
export function fiscaisParaCadastrar(
  itens: { modeloId: string; ficha: FichaFiscal }[],
): Map<string, FichaFiscal> {
  const porModelo = new Map<string, FichaFiscal>()

  for (const { modeloId, ficha } of itens) {
    if (!modeloId || !ficha?.ncm || porModelo.has(modeloId)) continue
    porModelo.set(modeloId, ficha)
  }

  return porModelo
}

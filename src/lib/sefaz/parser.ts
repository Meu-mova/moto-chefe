// Lê o retorno da Distribuição DF-e. Texto entra, objeto sai — sem rede, sem
// banco, sem gzip: a descompactação chega como função, para o módulo continuar
// puro e o teste não precisar produzir gzip de verdade.
//
// O lote vem como uma lista de <docZip>, cada um com o NSU e o schema. O schema
// é o que diz o que tem dentro: resNFe (resumo), procNFe (nota completa),
// resEvento (evento resumido) ou procEventoNFe (evento em forma completa,
// incluindo cancelamento).

import { XMLParser } from 'fast-xml-parser'

export type DocumentoDfe = {
  nsu: string
  tipo: 'resumo' | 'completa' | 'evento'
  chave: string
  emitenteCnpj: string
  emitenteNome: string
  valor: string
  dataEmissao: Date
  /** Só para tipo 'evento' — 110111 é cancelamento. */
  tipoEvento: string | null
  xml: string
}

export type RespostaDistribuicao = {
  cStat: number
  xMotivo: string
  ultNSU: string
  maxNSU: string
  documentos: DocumentoDfe[]
  /**
   * Quantos `docZip` do lote NÃO viraram documento — XML ilegível/corrompido
   * (catch do laço abaixo) ou schema que o parser ainda não reconhece (uma
   * forma nova da SEFAZ, ou uma que exista mas não tenha sido mapeada aqui —
   * ex.: `procInutNFe`, de inutilização de numeração). O NSU do lote avança
   * de qualquer jeito e a SEFAZ não reoferece o mesmo NSU depois, então cada
   * descarte é perda permanente: quem chama (sincronizar.ts) precisa saber
   * que isso aconteceu para não ficar em silêncio sobre uma nota que sumiu.
   * Foi assim que se descobriu a falta do `procEventoNFe` (ver `lerDocumento`
   * abaixo): 12 dos 156 documentos de uma sincronização real em 14/09/2026
   * caíram aqui e se perderam para sempre.
   */
  descartados: number
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,   // chave de NF-e tem 44 dígitos: como número vira lixo
  trimValues: true,
})

const lista = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const texto = (v: unknown): string => (v == null ? '' : String(v))

function achar(no: Record<string, unknown>, nome: string): Record<string, unknown> | null {
  // A resposta vem com prefixos de namespace variáveis entre ambientes; procurar
  // pelo fim do nome da tag é mais robusto que cravar "soap:Envelope".
  for (const [chave, valor] of Object.entries(no)) {
    if (chave === nome || chave.endsWith(`:${nome}`)) return valor as Record<string, unknown>
    if (valor && typeof valor === 'object') {
      const achado = achar(valor as Record<string, unknown>, nome)
      if (achado) return achado
    }
  }
  return null
}

function lerDocumento(nsu: string, xml: string): DocumentoDfe | null {
  const raiz = parser.parse(xml) as Record<string, unknown>

  const resumo = achar(raiz, 'resNFe')
  if (resumo) {
    return {
      nsu,
      tipo: 'resumo',
      chave: texto(resumo.chNFe),
      emitenteCnpj: texto(resumo.CNPJ),
      emitenteNome: texto(resumo.xNome),
      valor: texto(resumo.vNF),
      dataEmissao: new Date(texto(resumo.dhEmi)),
      tipoEvento: null,
      xml,
    }
  }

  const evento = achar(raiz, 'resEvento')
  if (evento) {
    return {
      nsu,
      tipo: 'evento',
      chave: texto(evento.chNFe),
      emitenteCnpj: texto(evento.CNPJ),
      emitenteNome: '',
      valor: '',
      dataEmissao: new Date(texto(evento.dhEvento)),
      tipoEvento: texto(evento.tpEvento),
      xml,
    }
  }

  // Evento em forma completa (procEventoNFe > evento > infEvento), não o
  // resumo (resEvento) tratado acima. Uma execução real em 14/09/2026 veio
  // com 156 documentos, 12 descartados — todos caíam aqui, porque este ramo
  // não existia: a SEFAZ manda boa parte dos cancelamentos assim, não como
  // resEvento, e sem NSU reoferecido o que caiu ali se perdeu para sempre.
  // Tratado como tipo 'evento', igual ao resEvento, para o ramo de
  // cancelamento em sincronizar.ts não precisar mudar nada.
  //
  // Atenção: um procEventoNFe de verdade tem DOIS `infEvento` — o do envio
  // (dentro de `evento`, com CNPJ do autor e dhEvento) e o do protocolo de
  // retorno (dentro de `retEvento`, sem CNPJ e com dhRegEvento no lugar de
  // dhEvento). `achar()` devolve o primeiro que encontra percorrendo o objeto
  // na ordem dos campos do XML — como `evento` vem antes de `retEvento` no
  // documento, é o `infEvento` certo (o do envio) que é achado primeiro. Isso
  // está coberto por teste com os dois `infEvento` presentes, para não
  // regredir se a ordem de busca do achar() mudar algum dia.
  const eventoCompleto = achar(raiz, 'infEvento')
  if (eventoCompleto) {
    return {
      nsu,
      tipo: 'evento',
      chave: texto(eventoCompleto.chNFe),
      emitenteCnpj: texto(eventoCompleto.CNPJ),
      emitenteNome: '',
      valor: '',
      dataEmissao: new Date(texto(eventoCompleto.dhEvento)),
      tipoEvento: texto(eventoCompleto.tpEvento),
      xml,
    }
  }

  // Nota completa (procNFe/infNFe). `infEvento` já foi descartado acima, e o
  // nome da tag (`infNFe` vs `infEvento`) não tem como colidir no achar() —
  // são tags diferentes — então um procEventoNFe nunca cai aqui, nem uma nota
  // completa cai no ramo de evento acima. Isso está coberto por teste com os
  // dois tipos de documento no mesmo lote. A expectativa inicial era que isto só
  // chegasse depois de manifestação (fase 2) — mas a consulta real de
  // 14/09/2026 provou o contrário: os NSU 1086 e 1087 vieram como nota
  // completa direto, sem manifestação nenhuma ter sido feita. Na prática a
  // SEFAZ pode entregar o processo completo mesmo sem ciência do destinatário.
  // O parser já lê os dois casos desde a fase 1, então isso não muda código —
  // só a certeza de quando ele é exercitado.
  const nfe = achar(raiz, 'infNFe')
  if (nfe) {
    const emit = (nfe.emit ?? {}) as Record<string, unknown>
    const total = ((nfe.total ?? {}) as Record<string, unknown>).ICMSTot as Record<string, unknown> | undefined
    const ide = (nfe.ide ?? {}) as Record<string, unknown>
    return {
      nsu,
      tipo: 'completa',
      chave: texto(nfe['@Id']).replace(/^NFe/, ''),
      emitenteCnpj: texto(emit.CNPJ),
      emitenteNome: texto(emit.xNome),
      valor: texto(total?.vNF),
      dataEmissao: new Date(texto(ide.dhEmi)),
      tipoEvento: null,
      xml,
    }
  }

  return null
}

export function lerRetorno(soapXml: string, descompactar: (b64: string) => string): RespostaDistribuicao {
  const raiz = parser.parse(soapXml) as Record<string, unknown>
  const ret = achar(raiz, 'retDistDFeInt')
  if (!ret) throw new Error('Resposta da SEFAZ sem retDistDFeInt')

  const lote = achar(ret, 'loteDistDFeInt')
  const zips = lote ? lista(lote.docZip as Record<string, unknown> | Record<string, unknown>[]) : []

  const documentos: DocumentoDfe[] = []
  let descartados = 0
  for (const zip of zips) {
    const nsu = texto(zip['@NSU'])
    try {
      const doc = lerDocumento(nsu, descompactar(texto(zip['#text'])))
      if (doc) {
        documentos.push(doc)
      } else {
        // Descompactou e fez parse, mas não é nenhuma das quatro formas
        // conhecidas (resNFe/resEvento/infNFe/infEvento) — uma forma que a
        // SEFAZ ainda não usou aqui, ou que exista e não esteja mapeada
        // (ex.: procInutNFe, de inutilização de numeração). Descartado em
        // silêncio, e o NSU já avançou. Conta pra `ultimo_erro` poder avisar.
        descartados++
      }
    } catch {
      // Um documento ilegível não pode derrubar o lote: o NSU avança de
      // qualquer jeito e o que ficar de fora não volta a ser oferecido.
      descartados++
      continue
    }
  }

  return {
    cStat: Number(texto(ret.cStat)),
    xMotivo: texto(ret.xMotivo),
    ultNSU: texto(ret.ultNSU),
    maxNSU: texto(ret.maxNSU),
    documentos,
    descartados,
  }
}

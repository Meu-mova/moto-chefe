import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerRetorno } from './parser'

// Resumo de NF-e: é o que a SEFAZ entrega ANTES de qualquer manifestação.
const RESUMO = `<resNFe versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
  <chNFe>31260953780554000115550010000123451000123456</chNFe>
  <CNPJ>53780554000115</CNPJ>
  <xNome>Q.P.A DISTRIBUICAO LTDA</xNome>
  <IE>0011223344</IE>
  <dhEmi>2026-09-12T14:32:00-03:00</dhEmi>
  <tpNF>1</tpNF>
  <vNF>31579.24</vNF>
  <digVal>abc</digVal>
  <dhRecbto>2026-09-12T14:40:00-03:00</dhRecbto>
  <cSitNFe>1</cSitNFe>
</resNFe>`

const EVENTO_CANCELAMENTO = `<resEvento versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
  <cOrgao>31</cOrgao>
  <CNPJ>53780554000115</CNPJ>
  <chNFe>31260953780554000115550010000123451000123456</chNFe>
  <dhEvento>2026-09-13T09:00:00-03:00</dhEvento>
  <tpEvento>110111</tpEvento>
  <nSeqEvento>1</nSeqEvento>
  <xEvento>Cancelamento</xEvento>
  <dhRecbto>2026-09-13T09:01:00-03:00</dhRecbto>
</resEvento>`

// Nota completa: só chega depois de manifestação (fase 2), mas o parser já
// sabe ler. Mínimo necessário: @Id (prefixo "NFe" + 44 dígitos), ide/dhEmi,
// emit/CNPJ, emit/xNome e total/ICMSTot/vNF.
const PROC_NFE = `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe31260953780554000115550010000123451000123456" versao="4.00">
      <ide>
        <dhEmi>2026-09-12T14:32:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>53780554000115</CNPJ>
        <xNome>Q.P.A DISTRIBUICAO LTDA</xNome>
      </emit>
      <total>
        <ICMSTot>
          <vNF>31579.24</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`

/** Monta o envelope como a SEFAZ devolve, com o conteúdo já "descompactado". */
function envelope(docs: { nsu: string; schema: string; conteudo: string }[], cStat = 138, ultNSU = '000000000000002', maxNSU = '000000000000002') {
  const zips = docs.map(d =>
    `<docZip NSU="${d.nsu}" schema="${d.schema}">${Buffer.from(d.conteudo).toString('base64')}</docZip>`).join('')
  return `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
 <soap:Body>
  <nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
   <nfeDistDFeInteresseResult>
    <retDistDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
     <tpAmb>1</tpAmb><verAplic>1.0</verAplic>
     <cStat>${cStat}</cStat><xMotivo>Documento localizado</xMotivo>
     <dhResp>2026-09-14T12:00:00-03:00</dhResp>
     <ultNSU>${ultNSU}</ultNSU><maxNSU>${maxNSU}</maxNSU>
     <loteDistDFeInt>${zips}</loteDistDFeInt>
    </retDistDFeInt>
   </nfeDistDFeInteresseResult>
  </nfeDistDFeInteresseResponse>
 </soap:Body>
</soap:Envelope>`
}

// No teste, "descompactar" só desfaz o base64 — o gzip é responsabilidade de
// quem chama, e deixar isso de fora é o que mantém o parser puro.
const semGzip = (b64: string) => Buffer.from(b64, 'base64').toString('utf8')

// ultNSU e maxNSU propositalmente diferentes entre si: se algum dia os dois
// campos forem trocados (ou um deles hardcoded), este teste tem que pegar —
// com valores iguais, uma troca passaria batido.
test('lê cStat, ultNSU e maxNSU do retorno', () => {
  const r = lerRetorno(envelope([], 138, '000000000000117', '000000000000120'), semGzip)
  assert.equal(r.cStat, 138)
  assert.equal(r.ultNSU, '000000000000117')
  assert.equal(r.maxNSU, '000000000000120')
})

test('resumo de NF-e vira documento com emitente, valor e data', () => {
  const r = lerRetorno(envelope([{ nsu: '000000000000001', schema: 'resNFe_v1.01.xsd', conteudo: RESUMO }]), semGzip)
  assert.equal(r.documentos.length, 1)
  const d = r.documentos[0]
  assert.equal(d.tipo, 'resumo')
  assert.equal(d.nsu, '000000000000001')
  assert.equal(d.chave, '31260953780554000115550010000123451000123456')
  assert.equal(d.emitenteCnpj, '53780554000115')
  assert.equal(d.emitenteNome, 'Q.P.A DISTRIBUICAO LTDA')
  assert.equal(d.valor, '31579.24')
  assert.equal(d.dataEmissao.toISOString(), '2026-09-12T17:32:00.000Z')
})

// O cancelamento é distribuído mesmo sem manifestação. Sem tratá-lo, o radar
// mostra como pendente uma nota que não existe mais.
test('evento de cancelamento é reconhecido e traz a chave da nota', () => {
  const r = lerRetorno(envelope([{ nsu: '000000000000002', schema: 'resEvento_v1.01.xsd', conteudo: EVENTO_CANCELAMENTO }]), semGzip)
  const d = r.documentos[0]
  assert.equal(d.tipo, 'evento')
  assert.equal(d.tipoEvento, '110111')
  assert.equal(d.chave, '31260953780554000115550010000123451000123456')
})

// ultNSU/maxNSU também diferentes aqui, e agora afirmados de fato: sem estes
// dois asserts, um lote vazio não exercitava a extração desses campos — o
// nsu.ts (Task anterior) falha fechado, e um valor errado aqui trava a
// sincronização em silêncio.
// A fase 2 vai gravar a nota completa direto do que este parser devolve — sem
// este teste, o ramo 'completa' (infNFe/procNFe) fica sem nenhuma cobertura.
test('nota completa (procNFe) vira documento tipo completa, sem o prefixo NFe na chave', () => {
  const r = lerRetorno(envelope([{ nsu: '000000000000003', schema: 'procNFe_v4.00.xsd', conteudo: PROC_NFE }]), semGzip)
  assert.equal(r.documentos.length, 1)
  const d = r.documentos[0]
  assert.equal(d.tipo, 'completa')
  assert.equal(d.chave, '31260953780554000115550010000123451000123456')
  assert.equal(d.emitenteCnpj, '53780554000115')
  assert.equal(d.emitenteNome, 'Q.P.A DISTRIBUICAO LTDA')
  assert.equal(d.valor, '31579.24')
  assert.equal(d.dataEmissao.toISOString(), '2026-09-12T17:32:00.000Z')
})

test('lote vazio não quebra', () => {
  const r = lerRetorno(envelope([], 137, '000000000000117', '000000000000120'), semGzip)
  assert.equal(r.cStat, 137)
  assert.equal(r.ultNSU, '000000000000117')
  assert.equal(r.maxNSU, '000000000000120')
  assert.deepEqual(r.documentos, [])
})

// Um documento ilegível no meio do lote não pode derrubar os outros: o NSU
// avança de qualquer jeito e o que foi perdido não volta.
test('documento ilegível é pulado, o resto do lote entra', () => {
  const r = lerRetorno(envelope([
    { nsu: '000000000000001', schema: 'resNFe_v1.01.xsd', conteudo: '<lixo' },
    { nsu: '000000000000002', schema: 'resNFe_v1.01.xsd', conteudo: RESUMO },
  ]), semGzip)
  assert.equal(r.documentos.length, 1)
  assert.equal(r.documentos[0].nsu, '000000000000002')
})

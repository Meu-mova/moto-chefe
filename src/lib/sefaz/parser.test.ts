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

// Evento em forma completa (procEventoNFe > evento > infEvento) — não o
// resumo (resEvento) acima. É assim que boa parte dos cancelamentos chega de
// verdade: numa sincronização real em 14/09/2026, 12 dos 156 documentos do
// lote caíram aqui e se perderam pra sempre (o NSU não é reoferecido), porque
// lerDocumento não reconhecia essa forma. Mínimo necessário dentro de
// infEvento: chNFe, tpEvento, CNPJ (autor) e dhEvento.
const PROC_EVENTO_CANCELAMENTO = `<procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <evento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">
    <infEvento Id="ID110111312609537805540001155500100001234510001234560101">
      <cOrgao>31</cOrgao>
      <tpAmb>1</tpAmb>
      <CNPJ>53780554000115</CNPJ>
      <chNFe>31260953780554000115550010000123451000123456</chNFe>
      <dhEvento>2026-09-13T09:00:00-03:00</dhEvento>
      <tpEvento>110111</tpEvento>
      <nSeqEvento>1</nSeqEvento>
      <verEvento>1.00</verEvento>
      <detEvento versao="1.00">
        <descEvento>Cancelamento</descEvento>
        <nProt>131260000123456</nProt>
        <xJust>Erro de emissão</xJust>
      </detEvento>
    </infEvento>
  </evento>
  <retEvento versao="1.00">
    <infEvento Id="">
      <tpAmb>1</tpAmb>
      <verAplic>1.0</verAplic>
      <cOrgao>31</cOrgao>
      <cStat>135</cStat>
      <xMotivo>Evento registrado e vinculado a NF-e</xMotivo>
      <chNFe>31260953780554000115550010000123451000123456</chNFe>
      <tpEvento>110111</tpEvento>
      <xEvento>Cancelamento</xEvento>
      <nSeqEvento>1</nSeqEvento>
      <cOrgaoAutor>31</cOrgaoAutor>
      <dhRegEvento>2026-09-13T09:00:05-03:00</dhRegEvento>
      <nProt>131260000123456</nProt>
    </infEvento>
  </retEvento>
</procEventoNFe>`

// Nota completa (procNFe/infNFe). A expectativa inicial era que isto só
// chegasse depois de manifestação (fase 2) — a consulta real de 14/09/2026
// provou o contrário: NSU 1086/1087 vieram completos sem manifestação
// nenhuma. O parser lê os dois casos desde a fase 1. Mínimo necessário: @Id
// (prefixo "NFe" + 44 dígitos), ide/dhEmi, emit/CNPJ, emit/xNome e
// total/ICMSTot/vNF.
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
  assert.equal(r.descartados, 0)
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

// Regressão direta dos 12 documentos perdidos em 14/09/2026: procEventoNFe
// (evento em forma completa) precisa virar documento igual ao resEvento —
// tipo 'evento' — e não pode entrar na contagem de descartados.
test('evento de cancelamento em forma completa (procEventoNFe) é reconhecido e não conta como descartado', () => {
  const r = lerRetorno(envelope([{ nsu: '000000000000004', schema: 'procEventoNFe_v1.00.xsd', conteudo: PROC_EVENTO_CANCELAMENTO }]), semGzip)
  assert.equal(r.documentos.length, 1)
  const d = r.documentos[0]
  assert.equal(d.tipo, 'evento')
  assert.equal(d.tipoEvento, '110111')
  assert.equal(d.chave, '31260953780554000115550010000123451000123456')
  assert.equal(d.emitenteCnpj, '53780554000115')
  assert.equal(d.dataEmissao.toISOString(), '2026-09-13T12:00:00.000Z')
  assert.equal(r.descartados, 0)
})

// Um procEventoNFe de verdade tem DOIS infEvento (o do envio, dentro de
// `evento`, e o do protocolo de retorno, dentro de `retEvento` — sem CNPJ e
// com dhRegEvento no lugar de dhEvento). O fixture acima já tem os dois; este
// teste deixa explícito que o achar() pega o certo (CNPJ e dataEmissao vindos
// do dhEvento do autor), não o de retEvento — senão emitenteCnpj viria vazio
// e dataEmissao seria "Invalid Date".
test('procEventoNFe com infEvento de envio e de retorno não confunde os dois', () => {
  const r = lerRetorno(envelope([{ nsu: '000000000000004', schema: 'procEventoNFe_v1.00.xsd', conteudo: PROC_EVENTO_CANCELAMENTO }]), semGzip)
  const d = r.documentos[0]
  assert.notEqual(d.emitenteCnpj, '')
  assert.equal(Number.isNaN(d.dataEmissao.getTime()), false)
})

// procNFe (nota completa, infNFe) e procEventoNFe (evento completo,
// infEvento) no mesmo lote: tag names diferentes, achar() não confunde um
// com o outro em documentos distintos do mesmo lote.
test('procNFe e procEventoNFe no mesmo lote não se confundem', () => {
  const r = lerRetorno(envelope([
    { nsu: '000000000000003', schema: 'procNFe_v4.00.xsd', conteudo: PROC_NFE },
    { nsu: '000000000000004', schema: 'procEventoNFe_v1.00.xsd', conteudo: PROC_EVENTO_CANCELAMENTO },
  ]), semGzip)
  assert.equal(r.documentos.length, 2)
  assert.equal(r.documentos[0].tipo, 'completa')
  assert.equal(r.documentos[1].tipo, 'evento')
  assert.equal(r.descartados, 0)
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
  assert.equal(r.descartados, 0)
})

// Um documento ilegível no meio do lote não pode derrubar os outros: o NSU
// avança de qualquer jeito e o que foi perdido não volta. `descartados` é o
// que permite sincronizar.ts avisar em `ultimo_erro` que uma nota se perdeu,
// em vez de ficar em silêncio.
test('documento ilegível é pulado, o resto do lote entra, e conta em descartados', () => {
  const r = lerRetorno(envelope([
    { nsu: '000000000000001', schema: 'resNFe_v1.01.xsd', conteudo: '<lixo' },
    { nsu: '000000000000002', schema: 'resNFe_v1.01.xsd', conteudo: RESUMO },
  ]), semGzip)
  assert.equal(r.documentos.length, 1)
  assert.equal(r.documentos[0].nsu, '000000000000002')
  assert.equal(r.descartados, 1)
})

// Forma realmente desconhecida — raiz que não é nenhuma das quatro tratadas
// (resNFe, resEvento, infNFe/procNFe, infEvento/procEventoNFe). A contagem
// de `descartados` precisa continuar existindo pro que ainda não se conhece:
// foi exatamente assim (`lerDocumento` devolvendo `null` em silêncio) que a
// falta do procEventoNFe passou despercebida até custar 12 documentos numa
// execução real em 14/09/2026 — antes desse fix, era esse schema que caía
// aqui.
test('schema desconhecido conta como descartado, sem derrubar o lote', () => {
  const r = lerRetorno(envelope([
    { nsu: '000000000000001', schema: 'formaFutura_v1.00.xsd', conteudo: '<formaFutura><algoQueNaoLemos/></formaFutura>' },
    { nsu: '000000000000002', schema: 'resNFe_v1.01.xsd', conteudo: RESUMO },
  ]), semGzip)
  assert.equal(r.documentos.length, 1)
  assert.equal(r.documentos[0].nsu, '000000000000002')
  assert.equal(r.descartados, 1)
})

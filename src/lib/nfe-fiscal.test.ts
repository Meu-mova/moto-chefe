import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extrairFiscalDaNfe, extrairEmitenteDaNfe, normalizarCest } from './nfe-fiscal'

// <det> reais, copiados de notas que o Radar Fiscal já baixou da SEFAZ.
// O primeiro é a moto GIGA da Q.P.A (a fábrica): ICMS-ST já recolhido por ela,
// que é o caso da imensa maioria das entradas.
const DET_GIGA = `<det nItem="1"><prod><cProd>GIGA</cProd><cEAN>SEM GTIN</cEAN><xProd>GIGA MOTO CHEFE</xProd><NCM>87116000</NCM><CEST>2600100</CEST><CFOP>5405</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>6400.0000000000</vUnCom><vProd>6400.00</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>1.0000</qTrib><vUnTrib>6400.0000000000</vUnTrib><indTot>1</indTot></prod><imposto><ICMS><ICMS60><orig>4</orig><CST>60</CST><vBCSTRet>5161.60</vBCSTRet><pST>12.0000</pST><vICMSSubstituto>462.23</vICMSSubstituto><vICMSSTRet>157.16</vICMSSTRet></ICMS60></ICMS><PIS><PISAliq><CST>01</CST><vBC>6400.00</vBC><pPIS>0.6500</pPIS><vPIS>41.60</vPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST><vBC>6400.00</vBC><pCOFINS>3.0000</pCOFINS><vCOFINS>192.00</vCOFINS></COFINSAliq></COFINS><IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>6166.40</vBC><gIBSUF><pIBSUF>0.1000</pIBSUF><vIBSUF>6.17</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.0000</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>6.17</vIBS><gCBS><pCBS>0.9000</pCBS><vCBS>55.50</vCBS></gCBS></gIBSCBS></IBSCBS></imposto><vItem>6618.83</vItem></det>`

// Acessório de outro fornecedor: ICMS00 (tributado normal) em vez de ICMS60, e
// com IPI no meio. Garante que o parser não depende da variante do grupo ICMS.
const DET_CARREGADOR = `<det nItem="1"><prod><cProd>C2E-IP15</cProd><cEAN>SEM GTIN</cEAN><xProd>Carregador Para iPhone 15 Duplo 50w Branco</xProd><NCM>85044010</NCM><CEST>2103700</CEST><CFOP>6106</CFOP><uCom>UN</uCom><qCom>1</qCom><vUnCom>39.60000000</vUnCom><vProd>39.60</vProd><indTot>1</indTot></prod><imposto><vTotTrib>19.31</vTotTrib><ICMS><ICMS00><orig>2</orig><CST>00</CST><modBC>3</modBC><vBC>39.60</vBC><pICMS>4.0000</pICMS><vICMS>1.58</vICMS></ICMS00></ICMS><IPI><cEnq>999</cEnq><IPINT><CST>53</CST></IPINT></IPI><PIS><PISAliq><CST>01</CST><vBC>39.60</vBC><pPIS>1.6500</pPIS><vPIS>0.65</vPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST><vBC>39.60</vBC><pCOFINS>7.6000</pCOFINS><vCOFINS>3.01</vCOFINS></COFINSAliq></COFINS><IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></IBSCBS></imposto><vItem>39.60</vItem></det>`

const envolver = (dets: string) => `<?xml version="1.0"?><nfeProc><NFe><infNFe><ide><nNF>40957</nNF></ide>${dets}</infNFe></NFe></nfeProc>`

test('extrai a ficha fiscal da moto da fábrica (ICMS60, ST já recolhida)', () => {
  const itens = extrairFiscalDaNfe(envolver(DET_GIGA))
  assert.equal(itens.length, 1)
  assert.deepEqual(itens[0], {
    codigo: 'GIGA',
    descricao: 'GIGA MOTO CHEFE',
    ncm: '87116000',
    cest: '2600100',
    cfopEntrada: '5405',
    unidade: 'UN',
    origem: '4',
    cstIcmsEntrada: '60',
    cstPis: '01',
    cstCofins: '01',
    classTribIbsCbs: '000001',
    tpPint: '',
  })
})

test('mesma extração num item ICMS00 com IPI no meio', () => {
  const [item] = extrairFiscalDaNfe(envolver(DET_CARREGADOR))
  assert.equal(item.ncm, '85044010')
  assert.equal(item.origem, '2')
  assert.equal(item.cstIcmsEntrada, '00')
  // O CST 53 do IPI não pode vazar para o campo do ICMS nem do PIS.
  assert.equal(item.cstPis, '01')
  assert.equal(item.cstCofins, '01')
})

test('vários itens na mesma nota saem na ordem', () => {
  const itens = extrairFiscalDaNfe(envolver(DET_GIGA + DET_CARREGADOR))
  assert.deepEqual(itens.map(i => i.codigo), ['GIGA', 'C2E-IP15'])
})

test('XML sem det (ou lixo) devolve lista vazia em vez de quebrar', () => {
  assert.deepEqual(extrairFiscalDaNfe('<nfeProc></nfeProc>'), [])
  assert.deepEqual(extrairFiscalDaNfe(''), [])
})

test('item sem NCM é descartado — ficha fiscal sem NCM não serve para emitir', () => {
  const semNcm = `<det nItem="1"><prod><cProd>X</cProd><xProd>Sem NCM</xProd><uCom>UN</uCom></prod><imposto></imposto></det>`
  assert.deepEqual(extrairFiscalDaNfe(envolver(semNcm)), [])
})

test('CSOSN do Simples Nacional entra no lugar do CST', () => {
  const sn = `<det nItem="1"><prod><cProd>Y</cProd><xProd>Simples</xProd><NCM>87116000</NCM><uCom>UN</uCom></prod><imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto></det>`
  const [item] = extrairFiscalDaNfe(envolver(sn))
  assert.equal(item.cstIcmsEntrada, '102')
  assert.equal(item.origem, '0')
})

test('extrai o emitente: e o CNPJ que explica duas fichas para o mesmo modelo', () => {
  const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe31250953780554000549550010000004201234567890" versao="4.00"><ide><nNF>420</nNF></ide><emit><CNPJ>53780554000549</CNPJ><xNome>Q.p.a Distribuicao Ltda</xNome></emit>${DET_GIGA}</infNFe></NFe></nfeProc>`
  assert.deepEqual(extrairEmitenteDaNfe(xml), {
    cnpj: '53780554000549',
    nome: 'Q.p.a Distribuicao Ltda',
    nfNumero: '420',
    nfChave: '31250953780554000549550010000004201234567890',
  })
})

test('emitente ausente devolve campos vazios em vez de quebrar', () => {
  assert.equal(extrairEmitenteDaNfe('<nfeProc></nfeProc>').cnpj, '')
})

test('normalizarCest aceita 7 dígitos, com ou sem máscara, e vazio vira nulo', () => {
  assert.deepEqual(normalizarCest('2600100'), { ok: true, cest: '2600100' })
  assert.deepEqual(normalizarCest('26.001.00'), { ok: true, cest: '2600100' })
  assert.deepEqual(normalizarCest('  '), { ok: true, cest: null })
})

test('normalizarCest recusa quantidade de dígitos diferente de 7', () => {
  assert.equal(normalizarCest('26001').ok, false)
  assert.equal(normalizarCest('260010012').ok, false)
})

test('lê o tpPint do veicProd da nota de entrada; sem veicProd fica vazio', () => {
  const comVeiculo = DET_GIGA.replace('<indTot>1</indTot></prod>', '<indTot>1</indTot><veicProd><tpOp>2</tpOp><tpPint>A</tpPint><tpVeic>2</tpVeic></veicProd></prod>')
  assert.equal(extrairFiscalDaNfe(envolver(comVeiculo))[0].tpPint, 'A')
  assert.equal(extrairFiscalDaNfe(envolver(DET_GIGA))[0].tpPint, '')
})

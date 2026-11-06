import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerListaDeChassis, modeloDaNota, planejarEntradaDeXmls } from './entrada-xml-lote'

const det = (n: number, cProd: string, xProd: string, q: number, cest: string, orig: string) =>
  `<det nItem="${n}"><prod><cProd>${cProd}</cProd><xProd>${xProd}</xProd><NCM>87116000</NCM><CEST>${cest}</CEST><CFOP>5405</CFOP><uCom>UN</uCom><qCom>${q}.0000</qCom><vUnCom>6400.0000000000</vUnCom></prod><imposto><ICMS><ICMS60><orig>${orig}</orig><CST>60</CST></ICMS60></ICMS><PIS><PISAliq><CST>01</CST></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST></COFINSAliq></COFINS></imposto></det>`
const nota = (nNF: string, dets: string, infCpl: string) =>
  `<nfeProc><NFe><infNFe Id="NFe352610537805540001155500100000${nNF.padStart(5, '0')}1000000001"><ide><nNF>${nNF}</nNF></ide><emit><CNPJ>53780554000115</CNPJ><xNome>Fornecedor Teste</xNome></emit>${dets}<infAdic><infCpl>${infCpl}</infCpl></infAdic></infNFe></NFe></nfeProc>`

// Nota de 3 motos: 2 vão para a loja, 1 não. A GIGA tem carta de correção de chassi.
const NF_2110 = nota('2110',
  det(1, 'GIGA', 'GIGA MOTO CHEFE', 2, '2600100', '4') + det(2, 'SOMA', 'SOMA MOTO CHEFE', 1, '2600100', '4'),
  'GIGA ST2025011500352 CINZA;GIGA LA2025SA110004989 PRETO;SOMA MCBRSOMA251023111 BRANCO')
const NF_37527 = nota('37527', det(1, 'MT-FAMILY', 'MOTO ELETRICA FAMILY', 1, '2600101', '1'),
  'FAMILY 350W MTBX150070012 SOFG0348V350W24"25080122 AMARELO')
const MODELOS = [{ id: 'm-giga', modelo: 'GIGA' }, { id: 'm-soma', modelo: 'SOMA' }, { id: 'm-family', modelo: 'FAMILY' }]

test('só as motos escolhidas entram, com cor, motor e NF do XML e ficha por chassi', () => {
  const p = planejarEntradaDeXmls([NF_2110, NF_37527], [
    { chassi: 'la2025sa110004989', precoCompra: '6400' },
    { chassi: 'MTBX150070012', precoCompra: '2410,41' },
  ], MODELOS)
  assert.deepEqual(p.problemas, [])
  assert.deepEqual(p.motos, [
    { chassi: 'LA2025SA110004989', cor: 'PRETO', motor: '', modeloId: 'm-giga', precoCompra: '6400', notaFiscal: '2110' },
    { chassi: 'MTBX150070012', cor: 'AMARELO', motor: 'SOFG0348V350W24"25080122', modeloId: 'm-family', precoCompra: '2410.41', notaFiscal: '37527' },
  ])
  assert.deepEqual(p.fiscais.map(f => [f.chassi, f.ficha.cest, f.ficha.origem, f.emitente.nfNumero]), [
    ['LA2025SA110004989', '2600100', '4', '2110'],
    ['MTBX150070012', '2600101', '1', '37527'],
  ])
  assert.deepEqual(p.semFicha, [])
})

test('carta de correção: grava o chassi corrigido com os dados do chassi antigo do XML', () => {
  const p = planejarEntradaDeXmls([NF_2110], [
    { chassi: 'LA2025SA110007631', chassiNaNota: 'ST2025011500352', precoCompra: '6400' },
  ], MODELOS)
  assert.deepEqual(p.problemas, [])
  assert.equal(p.motos[0].chassi, 'LA2025SA110007631')
  assert.equal(p.motos[0].cor, 'CINZA')
  assert.equal(p.fiscais[0].chassi, 'LA2025SA110007631')
  assert.equal(p.fiscais[0].ficha.descricao, 'GIGA MOTO CHEFE')
})

test('cada recusa diz o porquê e não entra no lote', () => {
  const p = planejarEntradaDeXmls([NF_2110], [
    { chassi: 'NAOEXISTE1234', precoCompra: '1' },
    { chassi: 'MCBRSOMA251023111', precoCompra: '0' },
    { chassi: 'LA2025SA110004989', modelo: 'JETMAX', precoCompra: '6400' },
    { chassi: 'LA2025SA110004989', precoCompra: '6400' },
  ], MODELOS)
  assert.deepEqual(p.problemas, [
    'NAOEXISTE1234: chassi NAOEXISTE1234 não está em nenhum XML',
    'MCBRSOMA251023111: preço de compra inválido',
    'LA2025SA110004989: modelo "JETMAX" da NF 2110 não está no catálogo da Conta',
    'LA2025SA110004989: repetido na lista',
  ])
  assert.equal(p.motos.length, 0)
})

test('o mesmo chassi em duas notas não entra: não dá para saber qual é a ficha', () => {
  const outra = nota('9999', det(1, 'GIGA', 'GIGA MOTO CHEFE', 1, '2600100', '4'), 'GIGA LA2025SA110004989 PRETO')
  const p = planejarEntradaDeXmls([NF_2110, outra], [{ chassi: 'LA2025SA110004989', precoCompra: '6400' }], MODELOS)
  assert.deepEqual(p.problemas, ['LA2025SA110004989: aparece em mais de uma nota (2110, 9999)'])
})

test('modelo da nota pelo mesmo de-para da tela', () => {
  const modelos = [{ id: 'm-jet', modelo: 'JET' }, { id: 'm-jetmax', modelo: 'JETMAX' }]
  assert.equal(modeloDaNota('JET MAX AM', modelos), 'm-jetmax')
  assert.equal(modeloDaNota('JET', modelos), 'm-jet')
  assert.equal(modeloDaNota('NADA', modelos), '')
})

test('lista do onboarding: colunas em qualquer ordem, preço nos dois formatos, opcionais vazios', () => {
  assert.deepEqual(lerListaDeChassis('\uFEFFpreco;chassi;modelo;chassi_na_nota\r\n6.400,00;LA2025SA110007631;;ST2025011500352\r\n2410.41;MTBX150070012;FAMILY;\r\n'), [
    { chassi: 'LA2025SA110007631', chassiNaNota: 'ST2025011500352', modelo: undefined, precoCompra: '6400.00' },
    { chassi: 'MTBX150070012', chassiNaNota: undefined, modelo: 'FAMILY', precoCompra: '2410.41' },
  ])
  assert.throws(() => lerListaDeChassis('chassi;modelo\nX;Y'), /colunas chassi e preco/)
})

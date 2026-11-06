import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerListaDeChassis, modeloDaNota, motosDeOutroCnpj, planejarEntradaDeXmls, recusaPorCnpjComprador } from './entrada-xml-lote'

const det = (n: number, cProd: string, xProd: string, q: number, cest: string, orig: string) =>
  `<det nItem="${n}"><prod><cProd>${cProd}</cProd><xProd>${xProd}</xProd><NCM>87116000</NCM><CEST>${cest}</CEST><CFOP>5405</CFOP><uCom>UN</uCom><qCom>${q}.0000</qCom><vUnCom>6400.0000000000</vUnCom></prod><imposto><ICMS><ICMS60><orig>${orig}</orig><CST>60</CST></ICMS60></ICMS><PIS><PISAliq><CST>01</CST></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST></COFINSAliq></COFINS></imposto></det>`
const nota = (nNF: string, dets: string, infCpl: string, dest = '33333333000191') =>
  `<nfeProc><NFe><infNFe Id="NFe352610112223330001815500100000${nNF.padStart(5, '0')}1000000001"><ide><nNF>${nNF}</nNF></ide><emit><CNPJ>11222333000181</CNPJ><xNome>Fornecedor Teste</xNome></emit><dest><CNPJ>${dest}</CNPJ></dest>${dets}<infAdic><infCpl>${infCpl}</infCpl></infAdic></infNFe></NFe></nfeProc>`

// Nota de 3 motos: 2 vão para a loja, 1 não. A GIGA tem carta de correção de chassi.
const NF_9901 = nota('9901',
  det(1, 'GIGA', 'GIGA MOTO CHEFE', 2, '2600100', '4') + det(2, 'SOMA', 'SOMA MOTO CHEFE', 1, '2600100', '4'),
  'GIGA TESTEGIGA0000001 CINZA;GIGA TESTEGIGA0000002 PRETO;SOMA TESTESOMA0000003 BRANCO')
const NF_9902 = nota('9902', det(1, 'MT-FAMILY', 'MOTO ELETRICA FAMILY', 1, '2600101', '1'),
  'FAMILY 350W TESTEFAM00000004 TSTM0348V350W24"99990001 AMARELO')
const MODELOS = [{ id: 'm-giga', modelo: 'GIGA' }, { id: 'm-soma', modelo: 'SOMA' }, { id: 'm-family', modelo: 'FAMILY' }]

test('só as motos escolhidas entram, com cor, motor e NF do XML e ficha por chassi', () => {
  const p = planejarEntradaDeXmls([NF_9901, NF_9902], [
    { chassi: 'testegiga0000002', precoCompra: '6400' },
    { chassi: 'TESTEFAM00000004', precoCompra: '2410.41' },
  ], MODELOS)
  assert.deepEqual(p.problemas, [])
  assert.deepEqual(p.motos, [
    { chassi: 'TESTEGIGA0000002', cor: 'PRETO', motor: '', modeloId: 'm-giga', precoCompra: '6400', notaFiscal: '9901' },
    { chassi: 'TESTEFAM00000004', cor: 'AMARELO', motor: 'TSTM0348V350W24"99990001', modeloId: 'm-family', precoCompra: '2410.41', notaFiscal: '9902' },
  ])
  assert.deepEqual(p.fiscais.map(f => [f.chassi, f.ficha.cest, f.ficha.origem, f.emitente.nfNumero]), [
    ['TESTEGIGA0000002', '2600100', '4', '9901'],
    ['TESTEFAM00000004', '2600101', '1', '9902'],
  ])
  assert.deepEqual(p.semFicha, [])
})

test('carta de correção: grava o chassi corrigido com os dados do chassi antigo do XML', () => {
  const p = planejarEntradaDeXmls([NF_9901], [
    { chassi: 'TESTEGIGA0000009', chassiNaNota: 'TESTEGIGA0000001', precoCompra: '6400' },
  ], MODELOS)
  assert.deepEqual(p.problemas, [])
  assert.equal(p.motos[0].chassi, 'TESTEGIGA0000009')
  assert.equal(p.motos[0].cor, 'CINZA')
  assert.equal(p.fiscais[0].chassi, 'TESTEGIGA0000009')
  assert.equal(p.fiscais[0].ficha.descricao, 'GIGA MOTO CHEFE')
})

test('cada recusa diz o porquê e não entra no lote', () => {
  const p = planejarEntradaDeXmls([NF_9901], [
    { chassi: 'NAOEXISTE1234', precoCompra: '1' },
    { chassi: 'TESTESOMA0000003', precoCompra: '0' },
    { chassi: 'TESTEGIGA0000002', modelo: 'JETMAX', precoCompra: '6400' },
    { chassi: 'TESTEGIGA0000002', precoCompra: '6400' },
  ], MODELOS)
  assert.deepEqual(p.problemas, [
    'NAOEXISTE1234: chassi NAOEXISTE1234 não está em nenhum XML',
    'TESTESOMA0000003: preço de compra inválido',
    'TESTEGIGA0000002: modelo "JETMAX" da NF 9901 não está no catálogo da Conta',
    'TESTEGIGA0000002: repetido na lista',
  ])
  assert.equal(p.motos.length, 0)
})

test('o mesmo chassi em duas notas não entra: não dá para saber qual é a ficha', () => {
  const outra = nota('9999', det(1, 'GIGA', 'GIGA MOTO CHEFE', 1, '2600100', '4'), 'GIGA TESTEGIGA0000002 PRETO')
  const p = planejarEntradaDeXmls([NF_9901, outra], [{ chassi: 'TESTEGIGA0000002', precoCompra: '6400' }], MODELOS)
  assert.deepEqual(p.problemas, ['TESTEGIGA0000002: aparece em mais de uma nota (9901, 9999)'])
})

test('modelo da nota pelo mesmo de-para da tela', () => {
  const modelos = [{ id: 'm-jet', modelo: 'JET' }, { id: 'm-jetmax', modelo: 'JETMAX' }]
  assert.equal(modeloDaNota('JET MAX AM', modelos), 'm-jetmax')
  assert.equal(modeloDaNota('JET', modelos), 'm-jet')
  assert.equal(modeloDaNota('NADA', modelos), '')
})

test('lista do onboarding: colunas em qualquer ordem, preço nos dois formatos, opcionais vazios', () => {
  assert.deepEqual(lerListaDeChassis('\uFEFFpreco;chassi;modelo;chassi_na_nota\r\n6.400,00;TESTEGIGA0000009;;TESTEGIGA0000001\r\n2410.41;TESTEFAM00000004;FAMILY;\r\n'), [
    { chassi: 'TESTEGIGA0000009', chassiNaNota: 'TESTEGIGA0000001', modelo: undefined, precoCompra: '6400.00' },
    { chassi: 'TESTEFAM00000004', chassiNaNota: undefined, modelo: 'FAMILY', precoCompra: '2410.41' },
  ])
  assert.throws(() => lerListaDeChassis('chassi;modelo\nX;Y'), /colunas chassi e preco/)
})

test('o chassi do XML usado por uma carta de correção não entra de novo com outra linha', () => {
  const p = planejarEntradaDeXmls([NF_9901], [
    { chassi: 'TESTEGIGA0000009', chassiNaNota: 'TESTEGIGA0000001', precoCompra: '6400' },
    { chassi: 'TESTEGIGA0000001', precoCompra: '6400' },
  ], MODELOS)
  assert.deepEqual(p.motos.map(m => m.chassi), ['TESTEGIGA0000009'])
  assert.deepEqual(p.problemas, ['TESTEGIGA0000001: a moto TESTEGIGA0000001 do XML já entra como TESTEGIGA0000009'])
})

test('compra por outro CNPJ (#731): cada moto leva o CNPJ que comprou, e as de outro CNPJ que o do grupo são apontadas', () => {
  const deOutro = nota('9903', det(1, 'GIGA', 'GIGA MOTO CHEFE', 1, '2600100', '4'), 'GIGA TESTEGIGA0000005 AZUL', '44444444000191')
  const p = planejarEntradaDeXmls([NF_9901, deOutro], [
    { chassi: 'TESTEGIGA0000002', precoCompra: '6400' },
    { chassi: 'TESTEGIGA0000005', precoCompra: '6400' },
  ], MODELOS)
  assert.deepEqual(p.compradores, [
    { chassi: 'TESTEGIGA0000002', cnpj: '33333333000191' },
    { chassi: 'TESTEGIGA0000005', cnpj: '44444444000191' },
  ])
  assert.deepEqual(motosDeOutroCnpj(p, '33.333.333/0001-91'), ['TESTEGIGA0000005'])
  assert.deepEqual(motosDeOutroCnpj(p, '44444444000191'), ['TESTEGIGA0000002'])
})

test('aplicar com compra de outro CNPJ (#731): só passa o CNPJ aceito pela flag', () => {
  const compradores = (...cnpjs: string[]) => ({ compradores: cnpjs.map((cnpj, i) => ({ chassi: `TESTECNPJ000000${i}`, cnpj })) })
  const GRUPO = '33333333000191'
  const ACEITO = '44444444000191'
  assert.equal(recusaPorCnpjComprador(compradores(GRUPO), GRUPO, undefined), null, 'tudo do grupo: passa sem flag')
  assert.match(recusaPorCnpjComprador(compradores(GRUPO, ACEITO), GRUPO, undefined) ?? '', /--aceito-cnpj-de-outro-grupo/, 'outro CNPJ sem flag recusa')
  assert.equal(recusaPorCnpjComprador(compradores(GRUPO, ACEITO), GRUPO, '44.444.444/0001-91'), null, 'CNPJ aceito passa')
  assert.match(recusaPorCnpjComprador(compradores(ACEITO, '55555555000191'), GRUPO, ACEITO) ?? '', /TESTECNPJ0000001 \(comprador 55555555000191\)/, '3º CNPJ recusa')
  assert.match(recusaPorCnpjComprador(compradores(ACEITO, ''), GRUPO, ACEITO) ?? '', /TESTECNPJ0000001 \(comprador sem CNPJ\)/, 'nota sem CNPJ no destinatário recusa')
})

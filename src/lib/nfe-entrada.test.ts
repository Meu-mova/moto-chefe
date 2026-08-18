import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMotosInfCpl, mapearModelo, extrairDaNfe } from './nfe-entrada'

// infCpl reais das notas de amostra (FSist).
const NF_1 = 'JETMAX 1000W LYDAE3936T1205576 JYX1000W260580054 VERMELHO;Valor de ICMS credito presumido: R$ 85,03'
const NF_SOMA = 'SOMA 1000W MCBRSOMA251031042 BRANCO;SOMA 1000W MCBRSOMA251030131 CINZA;SOMA 1000W MCBRSOMA251024145 PRETO;;;'
const NF_GIGA = 'GIGA C/ BAU 1000W LA2025SA120001282 QS60V30H25121806153 AZUL'

test('1 moto com motor; ignora a linha de ICMS', () => {
  const m = parseMotosInfCpl(NF_1)
  assert.equal(m.length, 1)
  assert.deepEqual(m[0], { modelo: 'JETMAX', chassi: 'LYDAE3936T1205576', motor: 'JYX1000W260580054', cor: 'VERMELHO' })
})

test('moto SEM motor (SOMA) e ignora os ";;;" vazios', () => {
  const m = parseMotosInfCpl(NF_SOMA)
  assert.equal(m.length, 3)
  assert.deepEqual(m[0], { modelo: 'SOMA', chassi: 'MCBRSOMA251031042', motor: '', cor: 'BRANCO' })
  assert.equal(m[2].cor, 'PRETO')
})

test('modelo com espaço no nome (GIGA C/ BAU)', () => {
  const m = parseMotosInfCpl(NF_GIGA)
  assert.equal(m.length, 1)
  assert.deepEqual(m[0], { modelo: 'GIGA C/ BAU', chassi: 'LA2025SA120001282', motor: 'QS60V30H25121806153', cor: 'AZUL' })
})

// NF 41296: a fábrica passou a marcar a variante entre a potência e o chassi.
// Sem tratar, "(RC)" era lido como chassi, o chassi virava motor e o motor sumia.
const NF_X12_RC = 'X12 1000W (RC) HL5TCAH3XT9W50420 10ZW6073316YA26190420 CARBONO;X12 1000W (RC) HL5TCAH32T9W50413 10ZW6073316YA26190413 CARBONO;Valor de ICMS credito presumido: R$ 646,44'
// Mesma variante colada na potência, como aparece em notas antigas do mesmo fornecedor.
const NF_X12_RC_COLADO = 'X12 1000W(RC) HL5TCAH3XS9W71248 10ZW6073316YA25181248 PRETO'
// NF 41360: cor com duas palavras — "cor = último token" perdia o "AZUL".
const NF_ROMA = 'ROMA 3000W HL5TCAH37T9W50049 12ZW6073316YA260190085 AZUL TURQUESA'
// NF 40743: número de motor com barra — não pode ser confundido com cor.
const NF_BIG_TRI = 'BIG TRI 1000W XL2026042062 HRD48/60V1000W202604120315 BRANCO'
// NF 41171: duas motos de modelos diferentes na mesma nota.
const NF_LUX = 'LUX 1000W R5XWL6315TM050036 MDKA60V1000W2605000036 MARFIM;TITAN 1000W R5XWL6325TM050188 MDKA60V1000W2605000188 CINZA'

test('variante entre parênteses não vira chassi (NF 41296)', () => {
  const m = parseMotosInfCpl(NF_X12_RC)
  assert.equal(m.length, 2)
  assert.deepEqual(m[0], {
    modelo: 'X12',
    chassi: 'HL5TCAH3XT9W50420',
    motor: '10ZW6073316YA26190420',
    cor: 'CARBONO',
  })
  assert.equal(m[1].chassi, 'HL5TCAH32T9W50413')
})

test('variante colada na potência ainda identifica a moto', () => {
  const m = parseMotosInfCpl(NF_X12_RC_COLADO)
  assert.equal(m.length, 1)
  assert.deepEqual(m[0], {
    modelo: 'X12',
    chassi: 'HL5TCAH3XS9W71248',
    motor: '10ZW6073316YA25181248',
    cor: 'PRETO',
  })
})

test('cor com duas palavras não é cortada (NF 41360)', () => {
  const m = parseMotosInfCpl(NF_ROMA)
  assert.deepEqual(m[0], {
    modelo: 'ROMA',
    chassi: 'HL5TCAH37T9W50049',
    motor: '12ZW6073316YA260190085',
    cor: 'AZUL TURQUESA',
  })
})

test('motor com barra continua sendo motor (NF 40743)', () => {
  const m = parseMotosInfCpl(NF_BIG_TRI)
  assert.deepEqual(m[0], {
    modelo: 'BIG TRI',
    chassi: 'XL2026042062',
    motor: 'HRD48/60V1000W202604120315',
    cor: 'BRANCO',
  })
})

test('modelos diferentes na mesma nota (NF 41171)', () => {
  const m = parseMotosInfCpl(NF_LUX)
  assert.equal(m.length, 2)
  assert.deepEqual(m[0], { modelo: 'LUX', chassi: 'R5XWL6315TM050036', motor: 'MDKA60V1000W2605000036', cor: 'MARFIM' })
  assert.deepEqual(m[1], { modelo: 'TITAN', chassi: 'R5XWL6325TM050188', motor: 'MDKA60V1000W2605000188', cor: 'CINZA' })
})

const MODELOS = ['BOB', 'GIGA', 'JET', 'JETMAX', 'SOMA', 'MC20', 'MC20 MINI']

test('de-para: match exato', () => {
  assert.equal(mapearModelo('SOMA', MODELOS), 'SOMA')
  assert.equal(mapearModelo('jetmax', MODELOS), 'JETMAX')
})

test('de-para: prefixo — GIGA C/ BAU vira GIGA', () => {
  assert.equal(mapearModelo('GIGA C/ BAU', MODELOS), 'GIGA')
})

test('de-para: exato não é encurtado — MC20 MINI fica MC20 MINI', () => {
  assert.equal(mapearModelo('MC20 MINI', MODELOS), 'MC20 MINI')
})

test('de-para: JETMAX não vira JET (palavra inteira)', () => {
  assert.equal(mapearModelo('JETMAX', MODELOS), 'JETMAX')
})

test('de-para: sem correspondência devolve null', () => {
  assert.equal(mapearModelo('MODELO INEXISTENTE ZZZ', MODELOS), null)
})

test('extrairDaNfe pega nNF e conta quantidade dos produtos', () => {
  const xml = '<xml><ide><nNF>40898</nNF></ide><det><prod><qCom>1.0000</qCom></prod></det>' +
    `<infAdic><infCpl>${NF_1}</infCpl></infAdic></xml>`
  const r = extrairDaNfe(xml)
  assert.equal(r.nNF, '40898')
  assert.equal(r.qtdProdutos, 1)
  assert.equal(parseMotosInfCpl(r.infCpl).length, r.qtdProdutos)
})

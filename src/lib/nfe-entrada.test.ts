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

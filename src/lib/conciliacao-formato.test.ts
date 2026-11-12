import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarFormato } from './conciliacao-formato'
import { montarRelatorioCielo, vendaCielo } from '@/test/relatorio-cielo-sintetico'
import { montarRelatorioRede, parcelaRede } from '@/test/relatorio-rede-sintetico'

test('relatório da Cielo é reconhecido pela capa, mesmo com a 1ª linha sem cara de cabeçalho', () => {
  assert.equal(detectarFormato(montarRelatorioCielo({ linhas: [vendaCielo()] })), 'cielo')
  assert.equal(detectarFormato(montarRelatorioCielo({ linhas: [], comCabecalho: false })), 'cielo')
})

test('InfinityPay, Stone e PagueVeloz continuam reconhecidos pela 1ª linha', () => {
  assert.equal(detectarFormato('Data e hora,Meio,Bandeira\n01/11/2026 10:00,Crédito,Visa'), 'infinitypay')
  assert.equal(detectarFormato('Cod PagueVeloz;Data\n1;2'), 'pagueveloz')
  assert.equal(detectarFormato('DOCUMENTO;STONECODE;DATA\n1;2;3'), 'stone')
})

test('texto que não é de nenhuma operadora não é reconhecido', () => {
  assert.equal(detectarFormato('coluna a;coluna b\n1;2'), null)
  assert.equal(detectarFormato(''), null)
})

test('relatório de pagamentos da Rede é reconhecido pelo cabeçalho', () => {
  assert.equal(detectarFormato(montarRelatorioRede([parcelaRede()])), 'rede')
})

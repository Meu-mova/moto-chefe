import test from 'node:test'
import assert from 'node:assert/strict'
import { OPERADORAS, codigoOperadora, nomeOperadora, separarPorRelatorio, temRelatorio } from './operadoras'

test('lista do cadastro: as com relatório, as de mercado e Outra (#471, #870)', () => {
  assert.deepEqual(OPERADORAS.map(o => o.nome), [
    'InfinityPay', 'Stone', 'PagueVeloz', 'Rede', 'Cielo', 'Rendimento', 'GetNet', 'Mercado Pago', 'SumUp', 'Outra',
  ])
})

test('InfinityPay, Stone, PagueVeloz, Rede, Cielo e Rendimento têm relatório importado (#471, #857, #870)', () => {
  assert.deepEqual(['infinitypay', 'stone', 'pagueveloz', 'rede', 'cielo', 'rendimento', 'sicredi'].map(temRelatorio),
    [true, true, true, true, true, true, false])
})

test('Outra vira código a partir do nome livre; as da lista mantêm o código (#471)', () => {
  assert.equal(codigoOperadora('rede', 'qualquer'), 'rede')
  assert.equal(codigoOperadora('outra', '  Sicredi Pág. Já '), 'sicredi-pag-ja')
  assert.equal(codigoOperadora('outra', '   '), '')
  assert.equal(codigoOperadora('inventada', 'x'), '')
})

test('nome de marca do código gravado; desconhecido aparece como veio (#460, #471)', () => {
  assert.deepEqual(['infinitypay', 'rede', 'redecard', 'mercadopago', 'rendimento', 'sicredi'].map(nomeOperadora),
    ['InfinityPay', 'Rede', 'Redecard', 'Mercado Pago', 'Rendimento', 'sicredi'])
})

test('conciliação: importa só as com relatório; as outras viram aviso de manual (#471)', () => {
  const r = separarPorRelatorio([{ operadora: 'getnet', nome: 'GetNet Loja' }, { operadora: 'stone', nome: 'Stone' }])
  assert.deepEqual(r, { comRelatorio: [{ operadora: 'stone', nome: 'Stone' }], manuais: [{ operadora: 'getnet', nome: 'GetNet Loja' }] })
})

test('Outra com nome de operadora da lista é recusada (#471)', () => {
  const naLista = { message: 'Essa operadora já está na lista: escolha ela no campo Operadora.' }
  assert.throws(() => codigoOperadora('outra', 'Stone'), naLista)
  assert.throws(() => codigoOperadora('outra', ' rede '), naLista)
  assert.throws(() => codigoOperadora('outra', 'Mercado Pago'), naLista)
  assert.equal(codigoOperadora('outra', 'Rede Itaú'), 'rede-itau')
})

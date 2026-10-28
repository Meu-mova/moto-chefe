import test from 'node:test'
import assert from 'node:assert/strict'
import { OPERADORAS, codigoOperadora, nomeOperadora, separarPorRelatorio, temRelatorio } from './operadoras'

test('lista do cadastro: as 3 com relatório, as de mercado e Outra (#471)', () => {
  assert.deepEqual(OPERADORAS.map(o => o.nome), [
    'InfinityPay', 'Stone', 'PagueVeloz', 'Rede', 'Cielo', 'GetNet', 'Mercado Pago', 'SumUp', 'Outra',
  ])
})

test('só InfinityPay, Stone e PagueVeloz têm relatório importado (#471)', () => {
  assert.deepEqual(['infinitypay', 'stone', 'pagueveloz', 'rede', 'cielo', 'sicredi'].map(temRelatorio),
    [true, true, true, false, false, false])
})

test('Outra vira código a partir do nome livre; as da lista mantêm o código (#471)', () => {
  assert.equal(codigoOperadora('rede', 'qualquer'), 'rede')
  assert.equal(codigoOperadora('outra', '  Sicredi Pág. Já '), 'sicredi-pag-ja')
  assert.equal(codigoOperadora('outra', '   '), '')
  assert.equal(codigoOperadora('inventada', 'x'), '')
})

test('nome de marca do código gravado; desconhecido aparece como veio (#460, #471)', () => {
  assert.deepEqual(['infinitypay', 'rede', 'redecard', 'mercadopago', 'sicredi'].map(nomeOperadora),
    ['InfinityPay', 'Rede', 'Redecard', 'Mercado Pago', 'sicredi'])
})

test('conciliação: importa só as com relatório; as outras viram aviso de manual (#471)', () => {
  const r = separarPorRelatorio([{ operadora: 'rede', nome: 'Rede Itaú' }, { operadora: 'stone', nome: 'Stone' }])
  assert.deepEqual(r, { comRelatorio: [{ operadora: 'stone', nome: 'Stone' }], manuais: [{ operadora: 'rede', nome: 'Rede Itaú' }] })
})

test('Outra com nome de operadora da lista é recusada (#471)', () => {
  const naLista = { message: 'Essa operadora já está na lista: escolha ela no campo Operadora.' }
  assert.throws(() => codigoOperadora('outra', 'Stone'), naLista)
  assert.throws(() => codigoOperadora('outra', ' rede '), naLista)
  assert.throws(() => codigoOperadora('outra', 'Mercado Pago'), naLista)
  assert.equal(codigoOperadora('outra', 'Rede Itaú'), 'rede-itau')
})

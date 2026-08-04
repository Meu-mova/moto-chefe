import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearPagueVeloz, tipoDoCupom, type OperacaoPagueVeloz } from './conciliacao-pagueveloz'

const CUPOM_CREDITO = `      VIA ESTABELECIMENTO | VENDA
           07/07/2026 14:58
MOTOCHEFE SUL DE MINAS
CNPJ:57.113.017/0001-72
PAYWAVE/VISA          R$6.531,12
VISA CREDITO 15x - Aprovado por senha
  AUTO:799092 TERM:A0088080`

// Operação real capturada do painel em 2026-08-04.
const OPERACAO: OperacaoPagueVeloz = {
  Id: 43997874,
  NSU: 508833108,
  CodigoAutorizacao: '799092',
  ValorBruto: 6531.12,
  ValorLiquido: 5790.77,
  QtdeParcelas: 15,
  Bandeira: 'VISA',
  DataVenda: '2026-07-07T14:59:04.928-03:00',
  Status: { Nome: 'Pago', Valor: 'Pago' },
  POS: { Id: 330475, Identificador: 'A0088080', Apelido: 'Loja PA' },
  CupomEstabelecimento: CUPOM_CREDITO,
  NumeroCartao: '48546430***0617',
}

test('valores já vêm em reais — não dividir por 100', () => {
  const [t] = mapearPagueVeloz([OPERACAO])
  assert.equal(t.valorBruto, 6531.12)
  assert.equal(t.valorLiquido, 5790.77)
})

// A chave gravada em `nsu` é o `Id` ("Cod PagueVeloz", primeira coluna do CSV),
// e não o campo `NSU` da operadora: é o que o CSV manual grava, e é essa
// igualdade que impede o agente de reimportar o que já foi subido à mão. Em
// produção, esta mesma operação (Id 43997874 / NSU 508833108) está gravada com
// nsu '43997874' — e nenhuma das 71 linhas tem os 9 dígitos do NSU.
test('a chave é o Cod PagueVeloz (Id), a mesma que o CSV grava', () => {
  const [t] = mapearPagueVeloz([OPERACAO])
  assert.equal(t.nsu, '43997874')
  assert.equal(t.nsu, String(OPERACAO.Id))
  assert.equal(t.autorizacao, '799092')
})

test('o NSU da operadora não é jogado fora — fica em rawData', () => {
  const [t] = mapearPagueVeloz([OPERACAO])
  assert.equal(t.rawData?.nsu_operadora, 508833108)
})

test('operação recusada é descartada', () => {
  const recusada = { ...OPERACAO, Status: { Nome: 'Recusado', Valor: 'Recusado' } }
  assert.deepEqual(mapearPagueVeloz([recusada]), [])
})

test('Id zero não vira string "0"', () => {
  assert.equal(mapearPagueVeloz([{ ...OPERACAO, Id: 0 }])[0].nsu, undefined)
})

test('data já vem em -03:00 e não pode ser deslocada de novo', () => {
  assert.equal(mapearPagueVeloz([OPERACAO])[0].dataTransacao, '2026-07-07')
})

test('venda depois das 21h fica no dia certo', () => {
  const [t] = mapearPagueVeloz([{ ...OPERACAO, DataVenda: '2026-07-07T22:30:00.000-03:00' }])
  assert.equal(t.dataTransacao, '2026-07-07')
})

// A PagueVeloz não tem campo de crédito/débito: a informação só existe no
// texto do cupom. Sem cupom, a única pista é a quantidade de parcelas.
test('crédito lido do cupom', () => {
  assert.equal(tipoDoCupom(CUPOM_CREDITO, 15), 'credito')
})

test('débito lido do cupom, mesmo com 1 parcela', () => {
  assert.equal(tipoDoCupom('MASTERCARD DEBITO - Aprovado por senha', 1), 'debito')
})

test('sem cupom, mais de uma parcela é crédito', () => {
  assert.equal(tipoDoCupom(null, 12), 'credito')
})

test('sem cupom e parcela única é débito', () => {
  assert.equal(tipoDoCupom('', 1), 'debito')
})

test('rawData guarda o id, o terminal e o apelido da loja', () => {
  const [t] = mapearPagueVeloz([OPERACAO])
  assert.equal(t.rawData?.id, 43997874)
  assert.equal(t.rawData?.terminal, 'A0088080')
  assert.equal(t.rawData?.apelido, 'Loja PA')
})

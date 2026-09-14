import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarAvisoNfe } from './nfe-recebida'

test('a mensagem começa com MOVA INFORMA', () => {
  const texto = montarAvisoNfe('Sul de Minas', [
    { emitenteNome: 'Q.P.A DISTRIBUICAO LTDA', valor: '31579.24', chave: '31260953780554000115550010000123451000123456' },
  ])
  assert.ok(texto.startsWith('MOVA INFORMA'), texto)
})

test('traz emitente e valor em reais', () => {
  const texto = montarAvisoNfe('Sul de Minas', [
    { emitenteNome: 'Q.P.A DISTRIBUICAO LTDA', valor: '31579.24', chave: '31260953780554000115550010000123451000123456' },
  ])
  assert.match(texto, /Q\.P\.A DISTRIBUICAO LTDA/)
  assert.match(texto, /31\.579,24/)
})

test('várias notas viram uma mensagem só, com o total', () => {
  const texto = montarAvisoNfe('Sul de Minas', [
    { emitenteNome: 'FORNECEDOR A', valor: '100.00', chave: 'a'.repeat(44) },
    { emitenteNome: 'FORNECEDOR B', valor: '250.50', chave: 'b'.repeat(44) },
  ])
  assert.match(texto, /2 notas/)
  assert.match(texto, /350,50/)
})

test('sem nota nova, não monta mensagem', () => {
  assert.equal(montarAvisoNfe('Sul de Minas', []), '')
})

test('mesma chave duas vezes no lote não soma o valor em dobro (resumo + completa no mesmo lote)', () => {
  const chave = 'a'.repeat(44)
  const texto = montarAvisoNfe('Sul de Minas', [
    { emitenteNome: 'FORNECEDOR A', valor: '100.00', chave },
    { emitenteNome: 'FORNECEDOR A', valor: '100.00', chave },
  ])
  assert.match(texto, /1 nota/)
  assert.doesNotMatch(texto, /2 notas/)
  assert.match(texto, /100,00/)
  assert.doesNotMatch(texto, /200,00/)
  assert.equal(texto.split('\n').filter(l => l.startsWith('•')).length, 1)
})

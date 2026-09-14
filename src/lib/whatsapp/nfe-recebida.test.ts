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

// I3: o radar não filtra por tipo de emitente de propósito — decisão de
// deixar passar qualquer nota, porque o valor está em pegar a que ninguém
// esperava. O texto tem que deixar isso claro, senão "chegou 1 nota nova"
// lido rápido no WhatsApp sugere compra de moto — e a maior parte das notas
// reais é conta de luz, telefone, fornecedor.
test('deixa claro que é qualquer nota contra o CNPJ, não só compra de moto', () => {
  const texto = montarAvisoNfe('Sul de Minas', [
    { emitenteNome: 'CEMIG DISTRIBUICAO', valor: '450.00', chave: 'a'.repeat(44) },
  ])
  assert.match(texto, /não só moto/i)
  assert.match(texto, /energia/i)
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

function notasFalsas(qtd: number) {
  return Array.from({ length: qtd }, (_, i) => ({
    emitenteNome: `FORNECEDOR ${i}`,
    valor: '10.00',
    chave: String(i).padStart(44, '0'),
  }))
}

test('9 notas ainda lista uma a uma', () => {
  const texto = montarAvisoNfe('Sul de Minas', notasFalsas(9))
  assert.equal(texto.split('\n').filter(l => l.startsWith('•')).length, 9)
  assert.match(texto, /9 notas/)
  assert.match(texto, /90,00/)
})

test('10 notas ou mais resume em vez de listar, mas o total continua certo', () => {
  const texto = montarAvisoNfe('Sul de Minas', notasFalsas(12))
  assert.equal(texto.split('\n').filter(l => l.startsWith('•')).length, 0)
  assert.match(texto, /12 notas/)
  assert.match(texto, /120,00/)
})

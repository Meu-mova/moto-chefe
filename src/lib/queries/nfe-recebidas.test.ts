import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificarBusca, numeroDaChave } from './nfe-recebidas'

test('classificarBusca: 44 dígitos é chave inteira', () => {
  const chave = '31260953780554000115550010000123451000123456'
  assert.deepEqual(classificarBusca(chave), { tipo: 'chave', valor: chave })
})

test('classificarBusca: texto curto e numérico é número da nota', () => {
  assert.deepEqual(classificarBusca('12345'), { tipo: 'numero', valor: '12345' })
})

test('classificarBusca: número com zero à esquerda casa sem os zeros', () => {
  assert.deepEqual(classificarBusca('000123'), { tipo: 'numero', valor: '123' })
})

test('classificarBusca: descarta caracteres que não são dígito antes de contar', () => {
  // Chave com pontuação/espaço (colada de um e-mail, por exemplo) ainda é
  // reconhecida como chave inteira pelos 44 dígitos que sobram.
  const chave = '3126 0953 7805 5400 0115 5500 1000 0123 4510 0012 3456'
  assert.deepEqual(classificarBusca(chave), { tipo: 'chave', valor: chave.replace(/\D/g, '') })
})

test('classificarBusca: texto sem nenhum dígito não filtra nada', () => {
  assert.equal(classificarBusca('abc'), null)
  assert.equal(classificarBusca(''), null)
})

test('classificarBusca: tudo zero vira número "0", não string vazia', () => {
  assert.deepEqual(classificarBusca('0000'), { tipo: 'numero', valor: '0' })
})

test('numeroDaChave: extrai as posições 26-34 sem zero à esquerda', () => {
  // dígitos 26..34 (1-indexed) da chave abaixo são "000012345"
  const chave = '31260953780554000115550010000123451000123456'
  assert.equal(numeroDaChave(chave), '12345')
})

test('numeroDaChave: bloco todo zero vira "0"', () => {
  const chave = '31260953780554000115550010000000000000123456'
  assert.equal(numeroDaChave(chave), '0')
})

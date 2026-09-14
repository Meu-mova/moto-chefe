import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cifrar, decifrar } from './cripto'

// 32 bytes em hex — o formato que CERT_MASTER_KEY tem que ter.
const CHAVE = 'a'.repeat(64)

test('o que foi cifrado volta igual', () => {
  process.env.CERT_MASTER_KEY = CHAVE
  const original = Buffer.from('conteúdo do certificado')
  assert.deepEqual(decifrar(cifrar(original)), original)
})

test('cifrar duas vezes o mesmo texto dá pacotes diferentes', () => {
  process.env.CERT_MASTER_KEY = CHAVE
  // IV aleatório por chamada: dois certificados iguais não podem produzir o
  // mesmo blob, senão o banco entrega essa informação de graça.
  assert.notEqual(cifrar('igual'), cifrar('igual'))
})

test('pacote adulterado não decifra — falha, não devolve lixo', () => {
  process.env.CERT_MASTER_KEY = CHAVE
  const pacote = cifrar('conteúdo do certificado')
  const [iv, tag, dados] = pacote.split(':')
  const corrompido = [iv, tag, Buffer.from('outra coisa').toString('base64')].join(':')
  assert.throws(() => decifrar(corrompido))
})

test('sem a chave mestra, falha na hora e com o nome da variável', () => {
  delete process.env.CERT_MASTER_KEY
  assert.throws(() => cifrar('x'), /CERT_MASTER_KEY/)
})

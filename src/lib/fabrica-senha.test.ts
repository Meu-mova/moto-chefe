import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { cifrarSenhaFabrica, lerSenhaFabrica, senhaFabricaCifrada } from './fabrica-senha'

before(() => {
  process.env.CERT_MASTER_KEY = 'a'.repeat(64)
})

test('senha cifrada volta igual na leitura e não fica legível no banco', () => {
  const pacote = cifrarSenhaFabrica('S3nh@:da:loja')
  assert.ok(!pacote.includes('S3nh@'))
  assert.equal(senhaFabricaCifrada(pacote), true)
  assert.equal(lerSenhaFabrica(pacote), 'S3nh@:da:loja')
})

test('senha antiga em texto puro é lida como está', () => {
  assert.equal(lerSenhaFabrica('minhasenha'), 'minhasenha')
  assert.equal(lerSenhaFabrica('a:b:c'), 'a:b:c')
  assert.equal(senhaFabricaCifrada('a:b:c'), false)
})

test('sem senha, nada', () => {
  assert.equal(lerSenhaFabrica(null), null)
  assert.equal(lerSenhaFabrica(''), null)
})

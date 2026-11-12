import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caminhosDosArquivos } from './apagar-venda'

test('caminhosDosArquivos: selfie e assinatura de cada documento, na ordem, sem os vazios', () => {
  const docs = [
    { selfiePath: 'g/1/selfie.jpg', assinaturaPath: 'g/1/assinatura.png' },
    { selfiePath: null, assinaturaPath: null },
    { selfiePath: null, assinaturaPath: 'g/3/assinatura.png' },
  ]
  assert.deepEqual(caminhosDosArquivos(docs), ['g/1/selfie.jpg', 'g/1/assinatura.png', 'g/3/assinatura.png'])
})

test('caminhosDosArquivos: sem documento, nada a apagar', () => {
  assert.deepEqual(caminhosDosArquivos([]), [])
})

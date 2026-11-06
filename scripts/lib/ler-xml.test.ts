import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodificarXml } from './ler-xml'

test('XML em UTF-8 sai como veio', () => {
  assert.equal(decodificarXml(Buffer.from('<xProd>MOTO ELÉTRICA</xProd>', 'utf8')), '<xProd>MOTO ELÉTRICA</xProd>')
})

test('nota antiga em ISO-8859-1 não corrompe o acento do xProd', () => {
  assert.equal(decodificarXml(Buffer.from('<xProd>MOTO ELÉTRICA</xProd>', 'latin1')), '<xProd>MOTO ELÉTRICA</xProd>')
})

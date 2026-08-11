import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gerarCodigo, hashCodigo, validarCodigo, MAX_TENTATIVAS, type EstadoCodigo } from './codigo'

const DOC = 'doc-1'
const AGORA = new Date('2026-08-11T14:00:00.000Z')
const estado = (over: Partial<EstadoCodigo> = {}): EstadoCodigo => ({
  codigoHash: hashCodigo('123456', DOC),
  expiraEm: new Date('2026-08-11T14:10:00.000Z'),
  tentativas: 0,
  usadoEm: null,
  ...over,
})

test('gerarCodigo devolve 6 dígitos', () => {
  for (let i = 0; i < 50; i++) assert.match(gerarCodigo(), /^\d{6}$/)
})

test('hash do mesmo código em documentos diferentes não colide', () => {
  assert.notEqual(hashCodigo('123456', 'doc-1'), hashCodigo('123456', 'doc-2'))
})

test('código correto e no prazo é aceito', () => {
  assert.equal(validarCodigo(estado(), '123456', DOC, AGORA), 'ok')
})

test('código errado é recusado', () => {
  assert.equal(validarCodigo(estado(), '000000', DOC, AGORA), 'incorreto')
})

test('código expirado é recusado mesmo estando correto', () => {
  const depois = new Date('2026-08-11T14:11:00.000Z')
  assert.equal(validarCodigo(estado(), '123456', DOC, depois), 'expirado')
})

test('código já usado não revalida', () => {
  assert.equal(validarCodigo(estado({ usadoEm: AGORA }), '123456', DOC, AGORA), 'usado')
})

test('estoura ao atingir o limite de tentativas', () => {
  assert.equal(validarCodigo(estado({ tentativas: MAX_TENTATIVAS }), '123456', DOC, AGORA), 'excedeu')
})

test('na última tentativa permitida ainda valida', () => {
  assert.equal(validarCodigo(estado({ tentativas: MAX_TENTATIVAS - 1 }), '123456', DOC, AGORA), 'ok')
})

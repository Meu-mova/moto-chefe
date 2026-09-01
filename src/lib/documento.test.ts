import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarCpfCnpj, soDigitosDoc, validarDocumento } from './documento'

test('formata CPF e CNPJ pelo comprimento', () => {
  assert.equal(formatarCpfCnpj('12345678901'), '123.456.789-01')
  assert.equal(formatarCpfCnpj('12345678000199'), '12.345.678/0001-99')
})

test('documento já formatado é reformatado igual', () => {
  assert.equal(formatarCpfCnpj('12.345.678/0001-99'), '12.345.678/0001-99')
})

test('comprimento estranho sai como veio, sem quebrar', () => {
  assert.equal(formatarCpfCnpj('123'), '123')
  assert.equal(formatarCpfCnpj(null), '')
})

test('soDigitosDoc tira pontuação', () => {
  assert.equal(soDigitosDoc('12.345.678/0001-99'), '12345678000199')
})

test('venda para CNPJ exige 14 dígitos', () => {
  assert.deepEqual(validarDocumento('juridica', '12.345.678/0001-99'), { ok: true, documento: '12345678000199' })
  assert.equal(validarDocumento('juridica', '').ok, false)
  assert.equal(validarDocumento('juridica', '12345678901').ok, false)
})

test('pessoa física pode vender sem CPF, mas não com CPF pela metade', () => {
  assert.deepEqual(validarDocumento('fisica', ''), { ok: true, documento: null })
  assert.deepEqual(validarDocumento('fisica', '123.456.789-01'), { ok: true, documento: '12345678901' })
  assert.equal(validarDocumento('fisica', '1234').ok, false)
})

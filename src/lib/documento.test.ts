import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarCpfCnpj, lerDocumentoCliente, mascararCpfCnpj, soDigitosDoc, validarDocumento } from './documento'

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

// ─── Documento do cliente na venda, reserva e demanda (#65) ─────────────────
test('CPF válido vira pessoa física, só com os dígitos', () => {
  assert.deepEqual(lerDocumentoCliente('529.982.247-25'), { ok: true, tipoPessoa: 'fisica', documento: '52998224725' })
})

test('CPF com dígito verificador errado é recusado', () => {
  assert.deepEqual(lerDocumentoCliente('529.982.247-26'), { ok: false, erro: 'CPF inválido — confira os números' })
})

test('CNPJ válido vira pessoa jurídica, só com os dígitos', () => {
  assert.deepEqual(lerDocumentoCliente('11.222.333/0001-81'), { ok: true, tipoPessoa: 'juridica', documento: '11222333000181' })
})

test('CNPJ com dígito verificador errado é recusado', () => {
  assert.deepEqual(lerDocumentoCliente('11.222.333/0001-82'), { ok: false, erro: 'CNPJ inválido — confira os números' })
})

test('CNPJ só de dígitos repetidos é recusado', () => {
  assert.equal(lerDocumentoCliente('00.000.000/0000-00').ok, false)
})

test('documento vazio ou de tamanho que não é CPF nem CNPJ é recusado', () => {
  const erro = { ok: false, erro: 'Informe o CPF (11 dígitos) ou o CNPJ (14 dígitos)' }
  assert.deepEqual(lerDocumentoCliente(''), erro)
  assert.deepEqual(lerDocumentoCliente(null), erro)
  assert.deepEqual(lerDocumentoCliente('112223330001'), erro)
})

test('CNPJ alfanumérico é recusado', () => {
  // Fora do escopo da #65: quem não sabe do formato novo digitaria letra sem querer.
  assert.equal(lerDocumentoCliente('12.ABC.345/01DE-35').ok, false)
})

// ─── Máscara do campo CPF/CNPJ enquanto se digita ──────────────────────────
test('até 11 dígitos a máscara é de CPF', () => {
  assert.equal(mascararCpfCnpj('529'), '529')
  assert.equal(mascararCpfCnpj('5299'), '529.9')
  assert.equal(mascararCpfCnpj('5299822'), '529.982.2')
  assert.equal(mascararCpfCnpj('52998224725'), '529.982.247-25')
})

test('de 12 a 14 dígitos a máscara é de CNPJ', () => {
  assert.equal(mascararCpfCnpj('112223330001'), '11.222.333/0001')
  assert.equal(mascararCpfCnpj('1122233300018'), '11.222.333/0001-8')
  assert.equal(mascararCpfCnpj('11222333000181'), '11.222.333/0001-81')
})

test('dígito além do 14º é ignorado', () => {
  assert.equal(mascararCpfCnpj('112223330001819'), '11.222.333/0001-81')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarCpfCnpj, lerContribuinteIcms, lerDocumentoCliente, mascararCpfCnpj, rotuloDocumento, soDigitosDoc, tipoPessoaDoDocumento, tipoPessoaSeCompleto, validarDocumento } from './documento'

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

test('venda para CNPJ exige CNPJ válido (#399, ADR-0015)', () => {
  assert.deepEqual(validarDocumento('juridica', '11.222.333/0001-81'), { ok: true, documento: '11222333000181' })
  assert.equal(validarDocumento('juridica', '').ok, false)
  assert.equal(validarDocumento('juridica', '52998224725').ok, false)
  assert.deepEqual(validarDocumento('juridica', '11.222.333/0001-82'), { ok: false, erro: 'CNPJ inválido — confira os números' })
  assert.equal(validarDocumento('juridica', '00.000.000/0000-00').ok, false)
})

test('pessoa física pode vender sem CPF, mas não com CPF pela metade ou com dígito errado (#399)', () => {
  assert.deepEqual(validarDocumento('fisica', ''), { ok: true, documento: null })
  assert.deepEqual(validarDocumento('fisica', '529.982.247-25'), { ok: true, documento: '52998224725' })
  assert.equal(validarDocumento('fisica', '1234').ok, false)
  assert.deepEqual(validarDocumento('fisica', '529.982.247-24'), { ok: false, erro: 'CPF inválido — confira os números' })
  assert.equal(validarDocumento('fisica', '111.111.111-11').ok, false)
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

test('tipo de pessoa pelo tamanho do documento', () => {
  assert.equal(tipoPessoaDoDocumento('11.222.333/0001-81'), 'juridica')
  assert.equal(tipoPessoaDoDocumento('529.982.247-25'), 'fisica')
  assert.equal(tipoPessoaDoDocumento(''), 'fisica')
})

test('tipo de pessoa só com o documento completo, sem conferir o dígito verificador', () => {
  assert.equal(tipoPessoaSeCompleto('11.222.333/0001-82'), 'juridica')
  assert.equal(tipoPessoaSeCompleto('529.982.247-26'), 'fisica')
  assert.equal(tipoPessoaSeCompleto('11.222.333/0001'), null)
  assert.equal(tipoPessoaSeCompleto(''), null)
})

test('rótulo do documento: CNPJ para 14 dígitos, CPF para o resto', () => {
  assert.equal(rotuloDocumento('11.222.333/0001-81'), 'CNPJ')
  assert.equal(rotuloDocumento('529.982.247-25'), 'CPF')
  assert.equal(rotuloDocumento('11.222.333/0001'), 'CPF')
  assert.equal(rotuloDocumento(null), 'CPF')
})

test('contribuinte de ICMS: comprador CNPJ sem escolha é não contribuinte; pessoa física não tem indicador', () => {
  assert.deepEqual(lerContribuinteIcms('11.222.333/0001-81', undefined, undefined),
    { indicadorIe: 'nao_contribuinte', inscricaoEstadual: null })
  assert.deepEqual(lerContribuinteIcms('529.982.247-25', 'contribuinte', '0623079040081'),
    { indicadorIe: null, inscricaoEstadual: null })
})

test('contribuinte guarda a IE só com dígitos; isento e não contribuinte não guardam IE', () => {
  assert.deepEqual(lerContribuinteIcms('11222333000181', 'contribuinte', ' 062.307.904/0081 '),
    { indicadorIe: 'contribuinte', inscricaoEstadual: '0623079040081' })
  assert.deepEqual(lerContribuinteIcms('11222333000181', 'contribuinte', '   '),
    { indicadorIe: 'contribuinte', inscricaoEstadual: null })
  assert.deepEqual(lerContribuinteIcms('11222333000181', 'isento', '0623079040081'),
    { indicadorIe: 'isento', inscricaoEstadual: null })
  assert.deepEqual(lerContribuinteIcms('11222333000181', 'nao_contribuinte', '0623079040081'),
    { indicadorIe: 'nao_contribuinte', inscricaoEstadual: null })
})

test('indicador de ICMS desconhecido é recusado, para não virar dado errado na NF', () => {
  assert.throws(() => lerContribuinteIcms('11222333000181', 'revenda', ''), /contribuinte de ICMS/i)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarCpf, normalizarChavePix, chavePixValida, nascimentoValido, IDADE_MINIMA,
} from './dados-funcionario'
import { cpfValido } from './documento'

// ─── CPF ──────────────────────────────────────────────────────────────────
test('CPF com dígito verificador correto é aceito', () => {
  assert.equal(cpfValido('529.982.247-25'), true)
})

test('CPF com dígito verificador errado é recusado', () => {
  assert.equal(cpfValido('529.982.247-26'), false)
})

test('CPF de dígitos repetidos é recusado', () => {
  // Passa na conta do dígito verificador, mas não existe.
  assert.equal(cpfValido('111.111.111-11'), false)
  assert.equal(cpfValido('000.000.000-00'), false)
})

test('CPF com menos de 11 dígitos é recusado', () => {
  assert.equal(cpfValido('5299822472'), false)
})

test('a pontuação é descartada na normalização', () => {
  assert.equal(normalizarCpf('529.982.247-25'), '52998224725')
})

// ─── chave PIX ────────────────────────────────────────────────────────────
test('chave do tipo CPF segue a regra de CPF', () => {
  assert.equal(chavePixValida('cpf', '529.982.247-25'), true)
  assert.equal(chavePixValida('cpf', '529.982.247-26'), false)
})

test('celular exige DDD e o nono dígito', () => {
  assert.equal(chavePixValida('celular', '(35) 99999-1234'), true)
  assert.equal(chavePixValida('celular', '99999-1234'), false)    // sem DDD
  assert.equal(chavePixValida('celular', '(35) 3999-1234'), false) // fixo, sem o 9
})

test('celular é normalizado no formato que o PIX usa', () => {
  assert.equal(normalizarChavePix('celular', '(35) 99999-1234'), '+5535999991234')
  assert.equal(normalizarChavePix('celular', '+55 35 99999-1234'), '+5535999991234')
})

test('e-mail precisa ter cara de e-mail', () => {
  assert.equal(chavePixValida('email', 'luiz@motochefe.com.br'), true)
  assert.equal(chavePixValida('email', 'luiz.motochefe.com.br'), false)
})

test('e-mail é normalizado em minúsculas', () => {
  assert.equal(normalizarChavePix('email', ' Luiz@MotoChefe.com.br '), 'luiz@motochefe.com.br')
})

test('chave aleatória tem 32 caracteres hexadecimais, com ou sem traços', () => {
  assert.equal(chavePixValida('aleatoria', '123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(chavePixValida('aleatoria', '123e4567e89b12d3a456426614174000'), true)
  assert.equal(chavePixValida('aleatoria', '123e4567-e89b-12d3-a456'), false)
  assert.equal(chavePixValida('aleatoria', 'zzz'), false)
})

// ─── nascimento ───────────────────────────────────────────────────────────
const HOJE = new Date('2026-08-04T12:00:00.000Z')

test('nascimento válido é aceito', () => {
  assert.equal(nascimentoValido('1990-03-15', HOJE), true)
})

test('data no futuro é recusada', () => {
  assert.equal(nascimentoValido('2027-01-01', HOJE), false)
})

test(`idade abaixo de ${IDADE_MINIMA} é recusada — quase sempre erro de digitação no ano`, () => {
  assert.equal(nascimentoValido('2020-03-15', HOJE), false)
})

test('quem faz aniversário hoje já tem a idade', () => {
  assert.equal(nascimentoValido('2012-08-04', HOJE), true)   // faz 14 hoje
  assert.equal(nascimentoValido('2012-08-05', HOJE), false)  // faz 14 amanhã
})

test('ano absurdo é recusado', () => {
  assert.equal(nascimentoValido('1899-01-01', HOJE), false)
})

test('formato fora de YYYY-MM-DD é recusado', () => {
  assert.equal(nascimentoValido('15/03/1990', HOJE), false)
  assert.equal(nascimentoValido('', HOJE), false)
})

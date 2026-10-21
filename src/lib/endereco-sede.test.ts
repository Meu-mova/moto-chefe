import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erroEnderecoSede, faltamNoEnderecoSede, limparEnderecoSede, montarEnderecoSede } from './endereco-sede'

const eco = { cep: '78010400', logradouro: 'Avenida Fernando Correa da Costa', numero: '707', complemento: '', bairro: 'Areão', cidade: 'Cuiabá', uf: 'mt' }

test('monta a linha do contrato a partir dos campos', () => {
  assert.equal(montarEnderecoSede(limparEnderecoSede(eco)), 'Avenida Fernando Correa da Costa, 707, Areão, CEP 78010-400, Cuiabá – MT')
  assert.equal(montarEnderecoSede(limparEnderecoSede({ ...eco, complemento: 'Sala 2' })), 'Avenida Fernando Correa da Costa, 707, Sala 2, Areão, CEP 78010-400, Cuiabá – MT')
})

test('faltando campo obrigatório, não monta (o contrato fica aguardando)', () => {
  assert.equal(montarEnderecoSede(limparEnderecoSede({ ...eco, numero: ' ' })), null)
})

test('recusa CEP e UF com formato errado', () => {
  assert.equal(erroEnderecoSede(limparEnderecoSede({ ...eco, cep: '7801' })), 'CEP inválido')
  assert.equal(erroEnderecoSede(limparEnderecoSede({ ...eco, uf: 'XX' })), 'UF inválida')
  assert.equal(erroEnderecoSede(limparEnderecoSede(eco)), null)
})

test('diz quais campos obrigatórios faltam', () => {
  assert.deepEqual(faltamNoEnderecoSede(limparEnderecoSede({ cep: '78010-400', cidade: 'Cuiabá' })), ['logradouro', 'número', 'bairro', 'UF'])
})

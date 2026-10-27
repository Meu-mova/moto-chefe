import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emitenteDaSimulacao } from './logo-danfe-tela'

test('emitente da simulação: razão social e uma linha por dado cadastrado do grupo', () => {
  assert.deepEqual(
    emitenteDaSimulacao({ nome: 'Mato Grosso', razaoSocial: 'ECO-WHEELS MOBILIDADE E DIVERSAO LTDA', enderecoSede: 'Av. Exemplo, 1000, Centro', cidadeSede: 'Cuiabá - MT', cnpj: '49366097000140' }),
    { nome: 'ECO-WHEELS MOBILIDADE E DIVERSAO LTDA', linhas: ['Av. Exemplo, 1000, Centro', 'Cuiabá - MT', 'CNPJ 49.366.097/0001-40'] },
  )
})

test('sem razão social nem endereço cadastrados: usa o nome do grupo e pula as linhas vazias', () => {
  assert.deepEqual(
    emitenteDaSimulacao({ nome: 'Teresina', razaoSocial: null, enderecoSede: '  ', cidadeSede: null, cnpj: '00000000000191' }),
    { nome: 'Teresina', linhas: ['CNPJ 00.000.000/0001-91'] },
  )
})

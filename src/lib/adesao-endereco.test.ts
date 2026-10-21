import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lojaSugerida } from './adesao-endereco'

test('separa endereço, cidade e CEP do endereço da sede', () => {
  assert.deepEqual(lojaSugerida('Loja Teste', 'Rua de Teste, 100, Centro, CEP 37550-000, Pouso Alegre – MG'), {
    nome: 'Loja Teste', cidade: 'Pouso Alegre', endereco: 'Rua de Teste, 100, Centro', cep: '37550-000',
  })
  assert.deepEqual(lojaSugerida('ECO WHEELS', 'Av. Fernando Correa da Costa, 707 – Areão, Cuiabá/MT 78010400'), {
    nome: 'ECO WHEELS', cidade: 'Cuiabá', endereco: 'Av. Fernando Correa da Costa, 707 – Areão', cep: '78010-400',
  })
})

test('traço entre espaços separa; traço colado é do nome da cidade', () => {
  assert.deepEqual(lojaSugerida('L', 'Rua E, 2 - Centro - Lavras/MG'), { nome: 'L', cidade: 'Lavras', endereco: 'Rua E, 2 - Centro', cep: '' })
  assert.deepEqual(lojaSugerida('L', 'Rua B, 5, Vila São-José, São João del-Rei – MG, 36300000'), {
    nome: 'L', cidade: 'São João del-Rei', endereco: 'Rua B, 5, Vila São-José', cep: '36300-000',
  })
})

test('sem cidade nem CEP reconhecíveis, deixa os campos vazios para o admin preencher', () => {
  assert.deepEqual(lojaSugerida(' Loja ', 'Rua A, 10'), { nome: 'Loja', cidade: '', endereco: 'Rua A, 10', cep: '' })
  assert.deepEqual(lojaSugerida('Loja', null), { nome: 'Loja', cidade: '', endereco: '', cep: '' })
})

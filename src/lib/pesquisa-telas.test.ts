import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, telaCasa } from './pesquisa-telas'
import { ITENS } from './navegacao'

test('acha a tela sem acento e sem caixa', () => {
  assert.equal(telaCasa({ label: 'Peças' }, 'pecas'), true)
  assert.equal(telaCasa({ label: 'Conciliação' }, 'CONCILIACAO'), true)
  assert.equal(telaCasa({ label: 'Ordens de Serviço' }, 'servi'), true)
})

test('consulta vazia ou só espaço mostra tudo', () => {
  assert.equal(telaCasa({ label: 'Caixa' }, ''), true)
  assert.equal(telaCasa({ label: 'Caixa' }, '   '), true)
})

test('não acha o que não está no nome', () => {
  assert.equal(telaCasa({ label: 'Caixa' }, 'vendas'), false)
})

test('normalizar tira acento de todos os nomes do menu', () => {
  for (const i of ITENS) assert.doesNotMatch(normalizar(i.label), /\p{M}|[áàâãéêíóôõúç]/u, i.label)
})

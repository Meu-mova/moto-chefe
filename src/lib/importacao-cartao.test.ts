import { test } from 'node:test'
import assert from 'node:assert/strict'
import { situacaoDoPedido, LIMITE_AGENTE_MS, LIMITE_EXECUCAO_MS } from './importacao-cartao'

const AGORA = new Date('2026-08-04T12:00:00.000Z')
const segundosAtras = (s: number) => new Date(AGORA.getTime() - s * 1000)

test('pedido recém-criado está só esperando o agente', () => {
  assert.equal(situacaoDoPedido({ status: 'pendente', criadoEm: segundosAtras(5), iniciadoEm: null }, AGORA), 'pendente')
})

test('pendente há muito tempo significa agente offline', () => {
  const velho = new Date(AGORA.getTime() - LIMITE_AGENTE_MS - 1000)
  assert.equal(situacaoDoPedido({ status: 'pendente', criadoEm: velho, iniciadoEm: null }, AGORA), 'offline')
})

test('rodando dentro do prazo continua rodando', () => {
  assert.equal(situacaoDoPedido({ status: 'rodando', criadoEm: segundosAtras(60), iniciadoEm: segundosAtras(30) }, AGORA), 'rodando')
})

test('rodando além do prazo é agente que morreu no meio', () => {
  const inicio = new Date(AGORA.getTime() - LIMITE_EXECUCAO_MS - 1000)
  assert.equal(situacaoDoPedido({ status: 'rodando', criadoEm: inicio, iniciadoEm: inicio }, AGORA), 'travado')
})

test('concluída e erro passam direto', () => {
  assert.equal(situacaoDoPedido({ status: 'concluida', criadoEm: segundosAtras(300), iniciadoEm: segundosAtras(280) }, AGORA), 'concluida')
  assert.equal(situacaoDoPedido({ status: 'erro', criadoEm: segundosAtras(300), iniciadoEm: segundosAtras(280) }, AGORA), 'erro')
})

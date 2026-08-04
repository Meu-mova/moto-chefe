import { test } from 'node:test'
import assert from 'node:assert/strict'
import { situacaoDoPedido, LIMITE_AGENTE_MS, LIMITE_EXECUCAO_MS } from './importacao-cartao'

const AGORA = new Date('2026-08-04T12:00:00.000Z')
const segundosAtras = (s: number) => new Date(AGORA.getTime() - s * 1000)

test('pedido recém-criado está só esperando o agente', () => {
  assert.equal(situacaoDoPedido({ status: 'pendente', criadoEm: segundosAtras(5), iniciadoEm: null }, AGORA), 'pendente')
})

test('pendente há muito tempo significa agente offline', () => {
  // O agente pergunta a cada 15s, então 1 minuto sem resposta já é "ninguém ouvindo".
  // Fixamos o valor esperado — não só o comportamento do operador — para que trocar a
  // constante (ex.: de 60s para 5s ou 5h) quebre o teste em vez de passar em silêncio.
  assert.equal(LIMITE_AGENTE_MS, 60_000)
  const velho = new Date(AGORA.getTime() - LIMITE_AGENTE_MS - 1000)
  assert.equal(situacaoDoPedido({ status: 'pendente', criadoEm: velho, iniciadoEm: null }, AGORA), 'offline')
})

test('rodando dentro do prazo continua rodando', () => {
  assert.equal(situacaoDoPedido({ status: 'rodando', criadoEm: segundosAtras(60), iniciadoEm: segundosAtras(30) }, AGORA), 'rodando')
})

test('rodando além do prazo é agente que morreu no meio', () => {
  // As três operadoras juntas levam bem menos que 5 minutos — fixamos o valor para que
  // a constante não possa mudar sem que o teste avise.
  assert.equal(LIMITE_EXECUCAO_MS, 300_000)
  const inicio = new Date(AGORA.getTime() - LIMITE_EXECUCAO_MS - 1000)
  assert.equal(situacaoDoPedido({ status: 'rodando', criadoEm: inicio, iniciadoEm: inicio }, AGORA), 'travado')
})

test('rodando sem iniciadoEm gravado conta o prazo a partir de criadoEm', () => {
  assert.equal(situacaoDoPedido({ status: 'rodando', criadoEm: segundosAtras(60), iniciadoEm: null }, AGORA), 'rodando')
  const inicio = new Date(AGORA.getTime() - LIMITE_EXECUCAO_MS - 1000)
  assert.equal(situacaoDoPedido({ status: 'rodando', criadoEm: inicio, iniciadoEm: null }, AGORA), 'travado')
})

test('concluída e erro passam direto', () => {
  assert.equal(situacaoDoPedido({ status: 'concluida', criadoEm: segundosAtras(300), iniciadoEm: segundosAtras(280) }, AGORA), 'concluida')
  assert.equal(situacaoDoPedido({ status: 'erro', criadoEm: segundosAtras(300), iniciadoEm: segundosAtras(280) }, AGORA), 'erro')
})

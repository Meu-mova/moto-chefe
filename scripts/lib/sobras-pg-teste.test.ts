import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ehSobra, IDADE_MINIMA_SEM_PID_MS, pidDoPostmaster } from './sobras-pg-teste'

const VELHA = IDADE_MINIMA_SEM_PID_MS + 1

test('lê o pid na primeira linha do postmaster.pid', () => {
  assert.equal(pidDoPostmaster('4242\n/tmp/dados\n1700000000\n5432\n'), 4242)
})

test('arquivo ausente, vazio ou com lixo não dá pid', () => {
  for (const conteudo of [null, '', '\n', 'abc\n', '0\n', '-5\n']) assert.equal(pidDoPostmaster(conteudo), null, String(conteudo))
})

test('pid morto é sobra', () => {
  assert.equal(ehSobra({ pid: 4242, vivo: false, idadeMs: 0 }), true)
})

test('pid vivo nunca é sobra, por mais velha que seja a pasta', () => {
  assert.equal(ehSobra({ pid: 4242, vivo: true, idadeMs: VELHA * 1000 }), false)
})

test('sem pid e velha é sobra', () => {
  assert.equal(ehSobra({ pid: null, vivo: false, idadeMs: VELHA }), true)
})

test('sem pid e recém-criada não é sobra: pode ser outra execução no meio do initdb', () => {
  assert.equal(ehSobra({ pid: null, vivo: false, idadeMs: 1000 }), false)
})

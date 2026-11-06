import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EsperaEsgotada } from '@/lib/limitar-concorrencia'
import { ConsultaError, respostaDoErro } from './erros'

test('fila cheia vira 408 dizendo que há consultas demais, sem detalhe interno', () => {
  assert.deepEqual(respostaDoErro(new EsperaEsgotada(10_000)), {
    status: 408,
    corpo: { erro: 'consulta demorou demais', detalhe: 'muitas consultas ao mesmo tempo' },
  })
})

test('erros da consulta mantêm o status e a mensagem de antes', () => {
  const casos: Array<[ConsultaError, number, string]> = [
    [new ConsultaError('vazio'), 400, 'sql vazio'],
    [new ConsultaError('nao_select'), 400, 'apenas SELECT e permitido'],
    [new ConsultaError('multiplos'), 400, 'apenas um comando (sem ;)'],
    [new ConsultaError('timeout', 'canceling statement'), 408, 'consulta demorou demais'],
    [new ConsultaError('erro', 'coluna x não existe'), 400, 'erro na consulta'],
  ]
  for (const [e, status, erro] of casos) {
    const r = respostaDoErro(e)
    assert.equal(r?.status, status, e.tipo)
    assert.equal(r?.corpo.erro, erro, e.tipo)
    assert.equal(r?.corpo.detalhe, e.detalhe || undefined, e.tipo)
  }
})

test('erro desconhecido fica para a rota decidir', () => {
  assert.equal(respostaDoErro(new Error('qualquer')), null)
})

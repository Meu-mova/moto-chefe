import { test } from 'node:test'
import assert from 'node:assert/strict'
import { posicoes, tempoResposta, leitura } from './individual'

test('posicoes: empate compartilha a faixa', () => {
  assert.deepEqual(posicoes([33, 33, 22]), ['1º–2º', '1º–2º', '3º'])
  assert.deepEqual(posicoes([20, 20, 20, 19]), ['1º–3º', '1º–3º', '1º–3º', '4º'])
  assert.deepEqual(posicoes([10, 8, 5]), ['1º', '2º', '3º'])
  assert.deepEqual(posicoes([]), [])
})

test('tempoResposta', () => {
  assert.equal(tempoResposta(45), '45s')
  assert.equal(tempoResposta(206), '3 min')
  assert.equal(tempoResposta(4592), '77 min')
  assert.equal(tempoResposta(10897), '3,0 h')
  assert.equal(tempoResposta(null), '—')
})

const MEDIA = { conversao: 4.2, tempoRespSeg: 4935 }

test('leitura: responde rápido + converte acima da média = pontos fortes', () => {
  const r = leitura({
    motos: 20, faturamento: 231537, faturamentoAnterior: 150000,
    atendimento: { leads: 258, comIncoming: 251, semResposta: 3, tempoRespSeg: 439, mensagens: 300, tarefas: 100, ganhos: 19, perdidos: 20, conversao: 7.4 },
  }, MEDIA)
  assert.ok(r.fortes.some(t => /rápido/i.test(t)))
  assert.ok(r.fortes.some(t => /acima da média/i.test(t)))
  assert.ok(r.fortes.some(t => /55%|54%|cresceu/i.test(t)))
})

test('leitura: lento + muitos perdidos = oportunidades', () => {
  const r = leitura({
    motos: 19, faturamento: 100000, faturamentoAnterior: 130000,
    atendimento: { leads: 775, comIncoming: 716, semResposta: 47, tempoRespSeg: 10897, mensagens: 1000, tarefas: 900, ganhos: 15, perdidos: 293, conversao: 1.9 },
  }, MEDIA)
  assert.ok(r.oportunidades.some(t => /resposta/i.test(t)))
  assert.ok(r.oportunidades.some(t => /abaixo da média/i.test(t)))
  assert.ok(r.oportunidades.some(t => /perdidos/i.test(t)))
  assert.ok(r.oportunidades.some(t => /caiu/i.test(t)))
})

test('leitura: sem atendimento não quebra e ainda dá leitura de vendas', () => {
  const r = leitura({ motos: 11, faturamento: 127610, faturamentoAnterior: 0, atendimento: null }, MEDIA)
  assert.ok(r.fortes.length >= 1)
  assert.ok(r.oportunidades.length >= 1)
})

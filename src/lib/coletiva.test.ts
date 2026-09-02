import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crescimento, maioresCrescimentos, estreantes, gerarOportunidades, type PodioVendedor,
} from './coletiva'

const v = (p: Partial<PodioVendedor> & { usuarioId: string }): PodioVendedor => ({
  nome: 'X', loja: 'L', qtd: 0, total: 0, qtdAnterior: 0, totalAnterior: 0, ...p,
})

test('crescimento: % sobre o mês anterior, null sem base', () => {
  assert.equal(crescimento(150, 100), 50)
  assert.equal(crescimento(100, 100), 0)
  assert.equal(crescimento(50, 0), null)
})

test('maioresCrescimentos: só quem já vendia e cresceu, ordenado pelo salto', () => {
  const lista = [
    v({ usuarioId: 'a', total: 200, totalAnterior: 100 }), // +100%
    v({ usuarioId: 'b', total: 120, totalAnterior: 100 }), // +20%
    v({ usuarioId: 'c', total: 80, totalAnterior: 100 }),  // caiu — fora
    v({ usuarioId: 'd', total: 50, totalAnterior: 0 }),    // estreante — fora
  ]
  const r = maioresCrescimentos(lista)
  assert.deepEqual(r.map(x => x.usuarioId), ['a', 'b'])
  assert.equal(r[0].pct, 100)
})

test('maioresCrescimentos: respeita o limite n', () => {
  const lista = Array.from({ length: 8 }, (_, i) =>
    v({ usuarioId: String(i), total: 200 + i, totalAnterior: 100 }))
  assert.equal(maioresCrescimentos(lista, 3).length, 3)
})

test('estreantes: sem venda no mês anterior e vendeu agora, maior primeiro', () => {
  const lista = [
    v({ usuarioId: 'a', qtd: 5, qtdAnterior: 0 }),
    v({ usuarioId: 'b', qtd: 11, qtdAnterior: 0 }),
    v({ usuarioId: 'c', qtd: 3, qtdAnterior: 2 }), // já vendia — fora
  ]
  assert.deepEqual(estreantes(lista).map(x => x.usuarioId), ['b', 'a'])
})

test('gerarOportunidades: monta origem, canal, OS e sempre a meta final', () => {
  const ops = gerarOportunidades({
    semOrigemQtd: 55, totalVendas: 246,
    canalTopNome: 'WhatsApp', canalTopQtd: 69,
    osQtd: 191, osQtdAnterior: 90,
    recordeMotos: 246, mesLabel: 'Agosto',
  })
  assert.equal(ops.length, 4)
  assert.match(ops[0].texto, /22% das vendas \(55\)/)
  assert.match(ops[1].titulo, /WhatsApp/)
  assert.match(ops[2].texto, /191 ordens/)
  assert.match(ops[2].texto, /bem acima do mês anterior, 90/)
  assert.match(ops[3].titulo, /superar Agosto/)
})

test('gerarOportunidades: sem origem/canal/OS, sobra só a meta', () => {
  const ops = gerarOportunidades({
    semOrigemQtd: 0, totalVendas: 10, canalTopNome: null, canalTopQtd: 0,
    osQtd: 0, osQtdAnterior: 0, recordeMotos: 10, mesLabel: 'Maio',
  })
  assert.equal(ops.length, 1)
  assert.match(ops[0].titulo, /superar Maio/)
})

test('gerarOportunidades: OS sem salto relevante não cita o mês anterior', () => {
  const ops = gerarOportunidades({
    semOrigemQtd: 0, totalVendas: 10, canalTopNome: null, canalTopQtd: 0,
    osQtd: 100, osQtdAnterior: 90, recordeMotos: 10, mesLabel: 'Maio',
  })
  const osOp = ops.find(o => o.icone === '🛒')!
  assert.doesNotMatch(osOp.texto, /acima do mês anterior/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcDesconto, somarDescontos, percentualDesconto,
  periodoAnteriorAoRegistro, DESCONTO_REGISTRADO_DESDE,
} from './desconto'

const linha = (valorMinimo: string | null, liquido: string | null, valor: string, estimado = false) => ({
  valorMinimoSnapshot: valorMinimo, liquidoSnapshot: liquido, valor, snapshotEstimado: estimado,
})

test('margem é o que faltou pro piso depois das taxas', () => {
  const d = calcDesconto(linha('10490.00', '9990.00', '9990.00'))
  assert.equal(d?.margem, 500)
})

test('preço é o que foi cedido na negociação, sobre o bruto', () => {
  const d = calcDesconto(linha('10490.00', '9990.00', '9990.00'))
  assert.equal(d?.preco, 500)
})

test('venda acima da tabela no cartão: preço zero, margem positiva', () => {
  // O caso da Julia: 10.908 em 12x com mínimo de 10.490. Ela não cedeu preço —
  // vendeu acima da tabela — mas a taxa derrubou o líquido pra 9.989,01.
  const d = calcDesconto(linha('10490.00', '9989.01', '10908.00'))
  assert.equal(d?.preco, 0)
  assert.ok(Math.abs(d!.margem - 500.99) < 0.01)
})

test('desconto nunca é negativo — nem margem, nem preço', () => {
  // Linha estimada de BOB: a tabela caiu de 8.000 pra 7.490 DEPOIS da venda.
  // Um "desconto" de -510 abateria o desconto real de outra venda na soma.
  const d = calcDesconto(linha('7490.00', '8000.00', '8000.00', true))
  assert.equal(d?.margem, 0)
  assert.equal(d?.preco, 0)
})

test('sem snapshot não inventa número', () => {
  assert.equal(calcDesconto(linha(null, null, '9990.00')), null)
  assert.equal(calcDesconto(linha('10490.00', null, '9990.00')), null)
})

test('soma agrega as duas medidas e conta as linhas', () => {
  const r = somarDescontos([
    linha('10490.00', '9990.00', '9990.00'),
    linha('12490.00', '12290.00', '12290.00'),
  ])
  assert.equal(r.qtd, 2)
  assert.equal(r.margem, 700)
  assert.equal(r.preco, 700)
  assert.equal(r.estimados, 0)
})

test('soma conta quantas linhas são estimativa do backfill', () => {
  const r = somarDescontos([
    linha('10490.00', '9990.00', '9990.00', true),
    linha('12490.00', '12290.00', '12290.00'),
  ])
  assert.equal(r.estimados, 1)
  assert.equal(r.qtd, 2)
})

test('soma ignora linha sem snapshot em vez de contá-la como zero', () => {
  const r = somarDescontos([linha('10490.00', '9990.00', '9990.00'), linha(null, null, '8000.00')])
  assert.equal(r.qtd, 1)
  assert.equal(r.margem, 500)
})

test('soma de lista vazia é zero, não NaN', () => {
  const r = somarDescontos([])
  assert.deepEqual(r, { qtd: 0, margem: 0, preco: 0, estimados: 0 })
})

test('percentual é o desconto sobre o faturamento, não sobre a contagem', () => {
  // 700 de desconto em 25.000 vendidos — 2,8%. Pela contagem antiga, duas de
  // duas vendas dariam 100%, que não diz nada sobre quanto dinheiro saiu.
  assert.equal(percentualDesconto(700, 25000), 2.8)
  assert.equal(percentualDesconto(0, 25000), 0)
})

test('percentual arredonda em uma casa', () => {
  // 500 em 300.000 é 0,1666...% — sem arredondar sujaria a célula.
  assert.equal(percentualDesconto(500, 300000), 0.2)
})

test('percentual não divide por zero', () => {
  assert.equal(percentualDesconto(0, 0), 0)
  // Desconto sem faturamento no recorte é sinal de filtro torto, não de 300%.
  assert.equal(percentualDesconto(3000, 0), 0)
})

test('período anterior a 10/07/2026 não tem registro de desconto', () => {
  assert.equal(DESCONTO_REGISTRADO_DESDE, '2026-07-10')
  assert.equal(periodoAnteriorAoRegistro('2026-06-01'), true)
  assert.equal(periodoAnteriorAoRegistro('2026-07-09'), true)
  assert.equal(periodoAnteriorAoRegistro('2026-07-10'), false)
  assert.equal(periodoAnteriorAoRegistro('2026-08-01'), false)
  assert.equal(periodoAnteriorAoRegistro(undefined), false)
})

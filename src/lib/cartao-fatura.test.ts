import test from 'node:test'
import assert from 'node:assert'
import {
  refDaFatura, agruparPorCartao, agruparEmFaturas, normalizarLancamento,
  type FaturaBruta, type LancamentoBruto,
} from './cartao-fatura'

// As três faturas que o Sicoob devolveu com data de fechamento em 04/09/2026.
const FATURAS: FaturaBruta[] = [
  { id: 'f6', dueDate: '2026-06-11T00:00:00.000Z', totalAmount: '3197.31',  billClosingDate: '2026-06-01T00:00:00.000Z' },
  { id: 'f7', dueDate: '2026-07-11T00:00:00.000Z', totalAmount: '14234.60', billClosingDate: '2026-07-01T00:00:00.000Z' },
  { id: 'f8', dueDate: '2026-08-11T00:00:00.000Z', totalAmount: '27970.37', billClosingDate: '2026-08-03T00:00:00.000Z' },
]

function compra(over: Partial<LancamentoBruto> & { date: string; amount: string }): LancamentoBruto {
  return {
    id: over.id ?? over.date + over.amount,
    description: over.description ?? 'COMPRA',
    category: over.category ?? null,
    status: over.status ?? 'POSTED',
    creditCardMetadata: over.creditCardMetadata ?? { cardNumber: '5810' },
    ...over,
  }
}

test('o que o provedor diz ganha da regra do ciclo', () => {
  // Compra de 02/09 com forecast 2026-10: sem o forecast a regra também diria
  // outubro, mas quem manda é o campo — o ciclo do cartão pode mudar.
  assert.equal(refDaFatura('2026-09-02', '2026-10', FATURAS), '2026-10')
  assert.equal(refDaFatura('2026-09-02', '2026-09', FATURAS), '2026-09')
})

test('sem forecast, a janela de fechamento decide', () => {
  // Fatura de julho fecha 01/07: compra de 16/06 é dela.
  assert.equal(refDaFatura('2026-06-16', null, FATURAS), '2026-07')
  // No dia do fechamento ainda entra na fatura que fecha.
  assert.equal(refDaFatura('2026-07-01', null, FATURAS), '2026-07')
  // Um dia depois já é da fatura seguinte, que fecha em 03/08.
  assert.equal(refDaFatura('2026-07-02', null, FATURAS), '2026-08')
  assert.equal(refDaFatura('2026-08-03', null, FATURAS), '2026-08')
})

test('compra velha demais cai no ciclo padrão, não na fatura mais antiga conhecida', () => {
  // Antes de qualquer fechamento conhecido: sem o corte, tudo isso desabaria na
  // fatura de junho e inflaria uma fatura de R$ 3.197,31 com R$ 42 mil.
  assert.equal(refDaFatura('2025-11-06', null, FATURAS), '2025-12')
  assert.equal(refDaFatura('2025-12-01', null, FATURAS), '2025-12')
  assert.equal(refDaFatura('2025-12-31', null, FATURAS), '2026-01')
  // Virada de ano na aritmética de mês.
  assert.equal(refDaFatura('2026-12-15', null, []), '2027-01')
})

test('gasto e pagamento não se anulam no total do cartão', () => {
  // A fatura de agosto tinha 12 pagamentos. Somar tudo junto mostraria "quase
  // zero gasto" num mês de R$ 14 mil em compras.
  const blocos = agruparPorCartao([
    { id: '1', data: '2026-08-01', descricao: 'POSTO', valor: 300, categoria: 'Gas stations', cartao: '5810', pendente: false },
    { id: '2', data: '2026-08-02', descricao: 'Pagamento recebido', valor: -300, categoria: 'Credit card payment', cartao: '5810', pendente: false },
  ])
  assert.equal(blocos.length, 1)
  assert.equal(blocos[0].totalGasto, 300)
  assert.equal(blocos[0].totalCredito, 300)
})

test('lançamento sem cartão vira bloco próprio em vez de sumir', () => {
  const blocos = agruparPorCartao([
    { id: '1', data: '2026-08-01', descricao: 'X', valor: 100, categoria: null, cartao: null, pendente: false },
    { id: '2', data: '2026-08-01', descricao: 'Y', valor: 900, categoria: null, cartao: '5786', pendente: false },
  ])
  assert.deepEqual(blocos.map(b => b.cartao), ['5786', null])
  assert.equal(blocos[1].totalGasto, 100)
})

test('agrupa em faturas, separa por cartão e mantém o total do banco', () => {
  const faturas = agruparEmFaturas([
    compra({ date: '2026-06-16T03:00:00.000Z', amount: '2390.43', creditCardMetadata: { cardNumber: '5810' } }),
    compra({ date: '2026-06-20T03:00:00.000Z', amount: '100.00',  creditCardMetadata: { cardNumber: '5347' } }),
    compra({ date: '2026-07-13T03:00:00.000Z', amount: '-14234.60', description: 'Pagamento recebido', category: 'Credit card payment', creditCardMetadata: { cardNumber: '5786' } }),
    compra({ date: '2026-09-02T03:00:00.000Z', amount: '51.62', creditCardMetadata: { cardNumber: '5810', billForecastDate: '2026-10' }, status: 'PENDING' }),
  ], FATURAS)

  // Da mais nova para a mais velha.
  assert.deepEqual(faturas.map(f => f.ref), ['2026-10', '2026-08', '2026-07'])

  const julho = faturas.find(f => f.ref === '2026-07')!
  assert.equal(julho.vencimento, '2026-07-11')
  assert.equal(julho.totalBanco, 14234.60)
  assert.equal(julho.totalGasto, 2490.43)
  assert.deepEqual(julho.cartoes.map(c => c.cartao), ['5810', '5347'])

  // A fatura em aberto não existe na lista do banco: aparece assim mesmo, com
  // totalBanco null, senão o gasto do mês corrente ficaria invisível.
  const outubro = faturas.find(f => f.ref === '2026-10')!
  assert.equal(outubro.totalBanco, null)
  assert.equal(outubro.totalGasto, 51.62)
  assert.equal(outubro.cartoes[0].lancamentos[0].pendente, true)
})

test('normalizarLancamento preserva o sinal que o provedor mandou', () => {
  const l = normalizarLancamento(compra({ date: '2026-07-13T03:00:00.000Z', amount: '-14234.60' }))
  assert.equal(l.valor, -14234.6)
  assert.equal(l.data, '2026-07-13')
})

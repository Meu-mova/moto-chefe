import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  motivoForaDoCalculo,
  somarDespesas,
  valorDespesa,
  soDigitos,
  type ConfigDespesas,
} from './despesas-operacionais'

const CONFIG: ConfigDespesas = {
  categoriasForaDoCalculo: new Set(['Compra de Motos', 'Retiradas', 'Cesar']),
  cnpjsForaDoCalculo: new Set(['53780554000115', '09089839000112']),
}

const saida = (over: Partial<Parameters<typeof motivoForaDoCalculo>[0]> = {}) => ({
  valor: '-100.00',
  categoria: null,
  favorecidoNome: null,
  descricao: null,
  ...over,
})

// ── o que fica de fora ───────────────────────────────────────────────────────

test('categoria marcada fica de fora', () => {
  assert.equal(motivoForaDoCalculo(saida({ categoria: 'Compra de Motos' }), CONFIG), 'categoria_marcada')
})

test('CNPJ da fábrica no favorecido, formatado como o extrato manda', () => {
  const s = saida({ favorecidoNome: '53.780.554 0001-15' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'compra_moto')
})

test('CNPJ da fábrica no meio da descrição do PIX', () => {
  const s = saida({ descricao: 'PIX EMITIDO OUTRA IF - Pagamento Pix|@09.089.839 0001-12|@motos' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'compra_moto')
})

test('retirada de sócio pega pela descrição, mesmo sem categoria', () => {
  const s = saida({ descricao: 'PIX EMITIDO OUTRA IF - Pagamento Pix|@***.855.106-**|@Retirada Cesar abril' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), 'retirada_socio')
})

// ── o que continua contando ──────────────────────────────────────────────────

test('saída comum é despesa operacional', () => {
  assert.equal(motivoForaDoCalculo(saida({ categoria: 'Aluguel' }), CONFIG), null)
})

test('saída sem categoria nenhuma continua contando', () => {
  assert.equal(motivoForaDoCalculo(saida({ descricao: 'DÉB.TÍTULO COBRANÇA - Posto galpão' }), CONFIG), null)
})

test('transferência entre empresas do grupo continua contando', () => {
  // O Cesar decidiu manter essas no cálculo — o teste trava a decisão.
  const s = saida({ descricao: 'TRANSF.REALIZADA PIX SICOOB-MESMA TIT. - FAV.: ECOMOV MOBILIDADE LTDA' })
  assert.equal(motivoForaDoCalculo(s, CONFIG), null)
})

test('CNPJ parecido mas diferente não é confundido com o da fábrica', () => {
  assert.equal(motivoForaDoCalculo(saida({ favorecidoNome: '53.780.554 0001-16' }), CONFIG), null)
})

test('"aposentadoria" não é lida como retirada', () => {
  assert.equal(motivoForaDoCalculo(saida({ descricao: 'INSS aposentadoria' }), CONFIG), null)
})

// ── sinal ────────────────────────────────────────────────────────────────────

test('valor negativo do extrato e positivo digitado à mão viram a mesma despesa', () => {
  assert.equal(valorDespesa('-1500.00'), 1500)
  assert.equal(valorDespesa('1500.00'), 1500)
})

test('soDigitos limpa a formatação do CNPJ', () => {
  assert.equal(soDigitos('53.780.554 0001-15'), '53780554000115')
})

// ── soma ─────────────────────────────────────────────────────────────────────

test('soma banco + manuais e separa o que ficou de fora', () => {
  const r = somarDespesas(
    [
      saida({ valor: '-1000.00', categoria: 'Aluguel' }),
      saida({ valor: '-500.00', categoria: 'Marketing' }),
      saida({ valor: '-250000.00', favorecidoNome: '53.780.554 0001-15' }),  // fábrica
      saida({ valor: '-30000.00', descricao: 'Retirada Cesar abril' }),      // sócio
    ],
    [
      { valor: '-200.00', categoria: 'Aluguel' },   // conta paga fora do Open Finance
      { valor: '1900.00', categoria: 'Marketing' }, // digitado sem o sinal
    ],
    CONFIG,
  )

  assert.equal(r.total, 1000 + 500 + 200 + 1900)
  assert.equal(r.foraDoCalculo.compra_moto, 250000)
  assert.equal(r.foraDoCalculo.retirada_socio, 30000)
  assert.deepEqual(r.porCategoria, [
    { categoria: 'Marketing', total: 2400 },
    { categoria: 'Aluguel', total: 1200 },
  ])
})

test('saída sem categoria aparece agrupada como "Sem categoria"', () => {
  const r = somarDespesas([saida({ valor: '-80.00' })], [], CONFIG)
  assert.deepEqual(r.porCategoria, [{ categoria: 'Sem categoria', total: 80 }])
})

test('lançamento manual com categoria marcada também fica de fora', () => {
  const r = somarDespesas([], [{ valor: '-5000.00', categoria: 'Cesar' }], CONFIG)
  assert.equal(r.total, 0)
  assert.equal(r.foraDoCalculo.categoria_marcada, 5000)
})

test('sem nada no período o total é zero', () => {
  const r = somarDespesas([], [], CONFIG)
  assert.equal(r.total, 0)
  assert.deepEqual(r.porCategoria, [])
})

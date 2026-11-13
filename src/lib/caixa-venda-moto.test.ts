import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lancamentosDinheiroDaVenda } from '@/lib/caixa-venda-moto'

const base = { lojaId: 'loja', usuarioId: 'u', vendaId: 'v', descricao: 'Venda dinheiro — Ana', data: '2026-11-12' }

test('um lançamento de entrada por pagamento em dinheiro, com o valor de cada um; as outras formas ficam fora', () => {
  assert.deepEqual(lancamentosDinheiroDaVenda([
    { tipo: 'dinheiro', valor: 3000 }, { tipo: 'pix', valor: 10000 }, { tipo: 'dinheiro', valor: 2000.5 },
  ], base), [
    { ...base, tipo: 'entrada', categoria: 'Venda', valor: '3000.00' },
    { ...base, tipo: 'entrada', categoria: 'Venda', valor: '2000.50' },
  ])
})

test('sem dinheiro, nenhum lançamento', () => {
  assert.deepEqual(lancamentosDinheiroDaVenda([{ tipo: 'cartao_credito', valor: 50 }], base), [])
})
